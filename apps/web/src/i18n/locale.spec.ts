import { describe, expect, it } from "vitest";
import {
  getAlternatePathMap,
  getLocaleFromPathname,
  isSupportedLocale,
  localizedPath,
  normalizeLocale,
  stripLocaleFromPathname,
  switchLocalePath,
} from "./locale";

describe("locale helpers", () => {
  it("accepts only supported locales", () => {
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
  });

  it("normalizes locale input safely", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("de")).toBe("fr");
    expect(normalizeLocale(undefined)).toBe("fr");
  });

  it("reads locale from localized paths", () => {
    expect(getLocaleFromPathname("/fr/join")).toBe("fr");
    expect(getLocaleFromPathname("/en")).toBe("en");
    expect(getLocaleFromPathname("/settings")).toBe(null);
  });

  it("builds and switches localized paths", () => {
    expect(localizedPath("fr", "/join")).toBe("/fr/join");
    expect(localizedPath("en", "/")).toBe("/en");
    expect(stripLocaleFromPathname("/en/auth")).toBe("/auth");
    expect(switchLocalePath("/fr/room/ABC123/play", "en")).toBe("/en/room/ABC123/play");
  });

  it("builds alternate path maps", () => {
    expect(getAlternatePathMap("/join")).toEqual({
      fr: "/fr/join",
      en: "/en/join",
      "x-default": "/",
    });
  });
});
