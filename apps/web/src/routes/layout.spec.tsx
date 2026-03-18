import { afterEach, describe, expect, it } from "vitest";
import { REMEMBERED_LOCALE_STORAGE_KEY } from "../i18n/localeMemory";
import { redirectToRememberedLocaleHome, router, validateAndRememberLocale } from "../router";

function collectRouteIds(route: { id: string; children?: Array<{ id: string; children?: unknown[] }> }) {
  const ids = [route.id];
  for (const child of route.children ?? []) {
    ids.push(...collectRouteIds(child as { id: string; children?: Array<{ id: string; children?: unknown[] }> }));
  }
  return ids;
}

const originalWindow = globalThis.window;
const hadWindow = "window" in globalThis;

function stubWindowWithStorage(initialEntries: Record<string, string> = {}) {
  const backing = new Map(Object.entries(initialEntries));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return backing.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          backing.set(key, value);
        },
      },
    },
  });
  return backing;
}

function restoreWindow() {
  if (!hadWindow) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: originalWindow,
  });
}

describe("router layout", () => {
  afterEach(() => {
    restoreWindow();
  });

  it("includes localized routes for the app shell", () => {
    const routeIds = collectRouteIds(router.routeTree);
    expect(routeIds.join("|")).toContain("/$locale");
    expect(routeIds.join("|")).toContain("/$locale/join");
    expect(routeIds.join("|")).toContain("/$locale/auth");
    expect(routeIds.join("|")).toContain("/$locale/settings");
    expect(routeIds.join("|")).toContain("/room/$roomCode/play");
    expect(routeIds.join("|")).toContain("/room/$roomCode/view");
  });

  it("redirects the neutral entry page to the remembered locale home", () => {
    stubWindowWithStorage({
      [REMEMBERED_LOCALE_STORAGE_KEY]: "en",
    });

    expect(redirectToRememberedLocaleHome()).toBe("/en");
  });

  it("stores the locale when navigating to a localized route", () => {
    const storage = stubWindowWithStorage();

    expect(validateAndRememberLocale("fr")).toBe("fr");
    expect(storage.get(REMEMBERED_LOCALE_STORAGE_KEY)).toBe("fr");
  });

  it("rejects unsupported locales before entering localized routes", () => {
    stubWindowWithStorage();

    expect(() => validateAndRememberLocale("de")).toThrow();
  });
});
