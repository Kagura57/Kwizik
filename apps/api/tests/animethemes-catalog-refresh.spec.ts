import { describe, expect, it } from "vitest";
import { normalizeAnimeAlias } from "../src/services/AnimeThemesCatalogService";

describe("animethemes catalog", () => {
  it("normalizes aliases for search", () => {
    expect(normalizeAnimeAlias("Shingeki no Kyojin!")).toBe("shingeki no kyojin");
  });
});
