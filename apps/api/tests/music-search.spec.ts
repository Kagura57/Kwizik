import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import * as aggregatorModule from "../src/services/MusicAggregator";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("music search route", () => {
  it("returns 400 when query is missing", async () => {
    const response = await app.handle(new Request("http://localhost/music/search"));
    expect(response.status).toBe(400);
  });

  it("returns unified provider payload", async () => {
    vi.spyOn(aggregatorModule, "unifiedMusicSearch").mockResolvedValue({
      query: "anime",
      limit: 5,
      fallback: [
        {
          provider: "youtube",
          id: "yt-1",
          title: "Mock Song",
          artist: "Mock Artist",
          durationSec: 120,
          previewUrl: null,
          sourceUrl: "https://www.youtube.com/watch?v=yt-1",
          embedUrl: null,
        },
      ],
      results: {
        spotify: [],
        deezer: [],
        "apple-music": [],
        tidal: [],
        youtube: [],
      },
      providerErrors: {},
    });

    const response = await app.handle(new Request("http://localhost/music/search?q=anime&limit=5"));
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      query: string;
      limit: number;
      results: Record<string, unknown>;
    };

    expect(payload.query).toBe("anime");
    expect(payload.limit).toBe(5);
    const fallback = (payload as { fallback?: unknown }).fallback;
    expect(Array.isArray(fallback)).toBe(true);
    expect((fallback as unknown[]).length).toBeLessThanOrEqual(5);
    expect(Object.keys(payload.results).sort()).toEqual(
      ["apple-music", "deezer", "spotify", "tidal", "youtube"].sort(),
    );
  });
});
