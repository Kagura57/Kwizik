import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSpotifyPlaylistTracks } from "../src/routes/music/spotify";
import { resetSpotifyTokenCacheForTests } from "../src/routes/music/spotify-auth";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("spotify playlist payload parsing", () => {
  const envKeys = [
    "SPOTIFY_ACCESS_TOKEN",
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "SPOTIFY_API_MODE",
    "SPOTIFY_BROWSE_ENABLED",
  ] as const;
  const originalEnv = new Map<string, string | undefined>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetSpotifyTokenCacheForTests();
    for (const key of envKeys) {
      originalEnv.set(key, process.env[key]);
      process.env[key] = " ";
    }
    process.env.SPOTIFY_ACCESS_TOKEN = "static-token";
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    for (const key of envKeys) {
      const original = originalEnv.get(key);
      if (typeof original === "string") {
        process.env[key] = original;
      } else {
        delete process.env[key];
      }
    }
    originalEnv.clear();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses playlist entries from modern item field", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            items: [
              {
                item: {
                  id: "track-modern",
                  name: "Song Modern",
                  artists: [{ name: "Artist One" }],
                  preview_url: "https://cdn.example.com/preview.mp3",
                  external_urls: { spotify: "https://open.spotify.com/track/track-modern" },
                },
              },
            ],
          }),
        ),
      ) as unknown as typeof fetch;

    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-modern",
      title: "Song Modern",
      artist: "Artist One",
    });
  });

  it("keeps compatibility with legacy track field", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            items: [
              {
                track: {
                  id: "track-legacy",
                  name: "Song Legacy",
                  artists: [{ name: "Artist Two" }],
                  preview_url: "https://cdn.example.com/legacy.mp3",
                  external_urls: { spotify: "https://open.spotify.com/track/track-legacy" },
                },
              },
            ],
          }),
        ),
      ) as unknown as typeof fetch;

    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-legacy",
      title: "Song Legacy",
      artist: "Artist Two",
    });
  });

  it("returns empty tracks when playlist items are unavailable without search fallback", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/playlists/playlist-id/items?")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (url.includes("/v1/playlists/playlist-id?")) {
        return Promise.resolve(
          jsonResponse({
            id: "playlist-id",
            name: "Top Rap",
            owner: { display_name: "Spotify" },
            tracks: { total: 0 },
          }),
        );
      }

      return Promise.resolve(jsonResponse({}, 404));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(0);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/v1/search?"))).toBe(false);
  });

  it("paginates spotify playlist tracks and returns all requested entries", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/playlists/playlist-id?")) {
        return Promise.resolve(
          jsonResponse({
            id: "playlist-id",
            name: "Big playlist",
            owner: { display_name: "Spotify" },
            tracks: { total: 205 },
          }),
        );
      }

      if (url.includes("/v1/playlists/playlist-id/items?")) {
        const parsed = new URL(url);
        const offset = Number(parsed.searchParams.get("offset") ?? "0");
        const limit = Number(parsed.searchParams.get("limit") ?? "100");
        const pageSize = Math.min(limit, 205 - offset);
        const pageItems = Array.from({ length: Math.max(0, pageSize) }, (_, index) => {
          const absolute = offset + index + 1;
          return {
            item: {
              id: `track-${absolute}`,
              name: `Song ${absolute}`,
              artists: [{ name: `Artist ${absolute}` }],
              preview_url: `https://cdn.example.com/${absolute}.mp3`,
              external_urls: { spotify: `https://open.spotify.com/track/track-${absolute}` },
            },
          };
        });
        return Promise.resolve(
          jsonResponse({
            total: 205,
            items: pageItems,
          }),
        );
      }

      return Promise.resolve(jsonResponse({}, 404));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 205);
    expect(tracks).toHaveLength(205);
    expect(tracks[0]).toMatchObject({ id: "track-1" });
    expect(tracks[204]).toMatchObject({ id: "track-205" });

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("offset=0"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("offset=100"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("offset=200"))).toBe(true);
  });
});
