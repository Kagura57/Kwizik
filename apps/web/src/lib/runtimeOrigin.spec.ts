import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeOrigin, shouldAllowLoopbackFallbacks } from "./runtimeOrigin";

const originalWindow = globalThis.window;
const hadWindow = "window" in globalThis;

function stubWindow(url: string) {
  const parsed = new URL(url);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        origin: parsed.origin,
      },
    },
  });
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

describe("runtime origin helpers", () => {
  afterEach(() => {
    restoreWindow();
  });

  it("allows loopback fallbacks on local vite dev origins", () => {
    stubWindow("http://localhost:5173");
    expect(shouldAllowLoopbackFallbacks()).toBe(true);

    stubWindow("http://127.0.0.1:4173");
    expect(shouldAllowLoopbackFallbacks()).toBe(true);
  });

  it("rejects loopback fallbacks on production origins", () => {
    stubWindow("https://kwizik.app");
    expect(shouldAllowLoopbackFallbacks()).toBe(false);
  });

  it("returns the current runtime origin when available", () => {
    stubWindow("https://kwizik.app");
    expect(getRuntimeOrigin()).toBe("https://kwizik.app");
  });

  it("rejects loopback fallbacks when no browser window exists", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(shouldAllowLoopbackFallbacks()).toBe(false);
    expect(getRuntimeOrigin()).toBe(null);
  });
});
