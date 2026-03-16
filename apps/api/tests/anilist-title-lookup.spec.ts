import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAniListEnglishTitleBySearch,
  fetchAniListMediaMetadataBySearch,
  fetchAniListMediaMetadataBySearchBatch,
} from "../src/services/AniListTitleLookup";

const originalFetch = globalThis.fetch;

describe("AniList title lookup", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it("returns the AniList english title when the search matches the romaji title", async () => {
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              Media: {
                title: {
                  romaji: "Kono Kaisha ni Suki na Hito ga Imasu",
                  english: "I Have a Crush at Work",
                  native: "この会社に好きな人がいます",
                  userPreferred: "Kono Kaisha ni Suki na Hito ga Imasu",
                },
                synonyms: ["Can You Keep a Secret?"],
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
      configurable: true,
      writable: true,
    });

    const englishTitle = await fetchAniListEnglishTitleBySearch(
      "Kono Kaisha ni Suki na Hito ga Imasu",
    );

    expect(englishTitle).toBe("I Have a Crush at Work");
  });

  it("returns null when the AniList english title is effectively the same as the canonical title", async () => {
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              Media: {
                title: {
                  romaji: "ONE PIECE",
                  english: "ONE PIECE",
                  native: "ONE PIECE",
                  userPreferred: "ONE PIECE",
                },
                synonyms: ["One Piece"],
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
      configurable: true,
      writable: true,
    });

    const englishTitle = await fetchAniListEnglishTitleBySearch("One Piece");

    expect(englishTitle).toBeNull();
  });

  it("returns the AniList english title for Fire Force season titles", async () => {
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              Media: {
                title: {
                  romaji: "Enen no Shouboutai: Ni no Shou",
                  english: "Fire Force Season 2",
                  native: "炎炎ノ消防隊 弐ノ章",
                  userPreferred: "Enen no Shouboutai: Ni no Shou",
                },
                synonyms: ["Enen no Shouboutai 2"],
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
      configurable: true,
      writable: true,
    });

    const englishTitle = await fetchAniListEnglishTitleBySearch("Enen no Shouboutai 2");

    expect(englishTitle).toBe("Fire Force Season 2");
  });

  it("returns the AniList english title for Higehiro", async () => {
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              Media: {
                title: {
                  romaji: "Hige wo Soru. Soshite Joshikousei wo Hirou.",
                  english:
                    "Higehiro: After Being Rejected, I Shaved and Took in a High School Runaway",
                  native: "ひげを剃る。そして女子高生を拾う。",
                  userPreferred: "Hige wo Soru. Soshite Joshikousei wo Hirou.",
                },
                synonyms: ["Higehiro"],
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
      configurable: true,
      writable: true,
    });

    const englishTitle = await fetchAniListEnglishTitleBySearch(
      "Hige wo Soru. Soshite Joshikousei wo Hirou.",
    );

    expect(englishTitle).toBe(
      "Higehiro: After Being Rejected, I Shaved and Took in a High School Runaway",
    );
  });

  it("returns popularity metadata when the AniList search matches", async () => {
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              Media: {
                title: {
                  romaji: "Shingeki no Kyojin",
                  english: "Attack on Titan",
                  native: "進撃の巨人",
                  userPreferred: "Shingeki no Kyojin",
                },
                synonyms: ["Attack on Titan"],
                popularity: 520123,
                seasonYear: 2013,
                genres: ["Action", "Drama", "Action"],
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
      configurable: true,
      writable: true,
    });

    const metadata = await fetchAniListMediaMetadataBySearch("Shingeki no Kyojin");

    expect(metadata).toEqual({
      englishTitle: "Attack on Titan",
      popularity: 520123,
      year: 2013,
      genres: ["Action", "Drama"],
    });
  });

  it("batches AniList metadata lookups in a single request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            media0: {
              title: {
                romaji: "Naruto",
                english: "Naruto",
                native: "NARUTO",
                userPreferred: "Naruto",
              },
              synonyms: ["NARUTO"],
              popularity: 410000,
              seasonYear: 2002,
              genres: ["Action"],
            },
            media1: {
              title: {
                romaji: "Bleach",
                english: "Bleach",
                native: "BLEACH",
                userPreferred: "Bleach",
              },
              synonyms: ["BLEACH"],
              popularity: 305000,
              seasonYear: 2004,
              genres: ["Action", "Supernatural"],
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchSpy,
      configurable: true,
      writable: true,
    });

    const metadata = await fetchAniListMediaMetadataBySearchBatch(["Naruto", "Bleach"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(metadata.get("Naruto")).toEqual({
      englishTitle: null,
      popularity: 410000,
      year: 2002,
      genres: ["Action"],
    });
    expect(metadata.get("Bleach")).toEqual({
      englishTitle: null,
      popularity: 305000,
      year: 2004,
      genres: ["Action", "Supernatural"],
    });
  });
});
