import { describe, expect, it } from "vitest";
import {
  buildAnimeThemesVideoKey,
  normalizeAnimeAlias,
} from "../src/services/AnimeThemesCatalogService";

describe("animethemes catalog", () => {
  it("normalizes aliases for search", () => {
    expect(normalizeAnimeAlias("Shingeki no Kyojin!")).toBe("shingeki no kyojin");
  });

  it("namespaces upstream video names by anime and theme to avoid cross-anime collisions", () => {
    const cowboyBebopKey = buildAnimeThemesVideoKey({
      animeId: "1",
      themeType: "OP",
      sequence: 1,
      basename: "OP.webm",
      filename: null,
      index: 1,
    });
    const swordArtOnlineKey = buildAnimeThemesVideoKey({
      animeId: "2",
      themeType: "OP",
      sequence: 1,
      basename: "OP.webm",
      filename: null,
      index: 1,
    });

    expect(cowboyBebopKey).toBe("1-OP1-OP.webm");
    expect(swordArtOnlineKey).toBe("2-OP1-OP.webm");
    expect(cowboyBebopKey).not.toBe(swordArtOnlineKey);
  });

  it("falls back to a deterministic anime-scoped index when upstream names are missing", () => {
    expect(
      buildAnimeThemesVideoKey({
        animeId: "777",
        themeType: "ED",
        sequence: 2,
        basename: null,
        filename: null,
        index: 3,
      }),
    ).toBe("777-ED2-v3");
  });
});
