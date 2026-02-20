import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSpotifyPlaylistTracks,
  resetSpotifyPlaylistRateLimitForTests,
  SPOTIFY_RATE_LIMITED_ERROR,
} from "../src/routes/music/spotify";
import { resetSpotifyTokenCacheForTests } from "../src/routes/music/spotify-auth";

function jsonResponse(
  payload: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
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
    "SPOTIFY_MARKET",
  ] as const;
  const originalEnv = new Map<string, string | undefined>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetSpotifyTokenCacheForTests();
    resetSpotifyPlaylistRateLimitForTests();
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
                  duration_ms: 212345,
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
      durationSec: 212,
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
                  duration_ms: 185001,
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
      durationSec: 185,
    });
  });

  it("supports payload with tracks.items shape", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            tracks: {
              items: [
                {
                  track: {
                    id: "track-nested-items",
                    name: "Song Nested",
                    duration_ms: 198765,
                    artists: [{ name: "Artist Nested" }],
                    preview_url: "https://cdn.example.com/nested.mp3",
                    external_urls: { spotify: "https://open.spotify.com/track/track-nested-items" },
                  },
                },
              ],
            },
          }),
        ),
      ) as unknown as typeof fetch;

    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-nested-items",
      title: "Song Nested",
      artist: "Artist Nested",
      durationSec: 199,
    });
  });

  it("supports payload where playlist items are direct tracks", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "track-direct",
                name: "Song Direct",
                duration_ms: 201234,
                artists: [{ name: "Artist Direct" }],
                preview_url: "https://cdn.example.com/direct.mp3",
                external_urls: { spotify: "https://open.spotify.com/track/track-direct" },
              },
            ],
          }),
        ),
      ) as unknown as typeof fetch;

    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-direct",
      title: "Song Direct",
      artist: "Artist Direct",
      durationSec: 201,
    });
  });

  it("ignores local and null playlist entries while keeping valid nested track entries", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/playlists/playlist-id/tracks?")) {
        return Promise.resolve(
          jsonResponse({
            total: 3,
            items: [
              { is_local: true, track: { id: "local-1", name: "Local Song", artists: [{ name: "Local Artist" }] } },
              { track: null },
              {
                track: {
                  id: "track-valid",
                  name: "Song Valid",
                  duration_ms: 240700,
                  artists: [{ name: "Artist Valid" }],
                  preview_url: "https://cdn.example.com/valid.mp3",
                  external_urls: { spotify: "https://open.spotify.com/track/track-valid" },
                },
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 10);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-valid",
      title: "Song Valid",
      artist: "Artist Valid",
      durationSec: 241,
    });
  });

  it("returns empty tracks when playlist items are unavailable without search fallback", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/playlists/playlist-id/tracks?")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      return Promise.resolve(jsonResponse({}, 404));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(0);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/v1/search?"))).toBe(false);
  });

  it("caps spotify playlist fetch to first 100 tracks without pagination", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/playlists/playlist-id/tracks?")) {
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
    expect(tracks).toHaveLength(100);
    expect(tracks[0]).toMatchObject({ id: "track-1" });
    expect(tracks[99]).toMatchObject({ id: "track-100" });

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("offset=0"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("offset=100"))).toBe(false);
    expect(calledUrls.some((url) => url.includes("offset=200"))).toBe(false);
  });

  it("normalizes nested spotify source payload before calling playlist endpoint", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/playlists/37i9dQZEVXbMDoHDwVN2tF/tracks?")) {
        return Promise.resolve(
          jsonResponse({
            total: 1,
            items: [
              {
                track: {
                  id: "track-normalized",
                  name: "Song Normalized",
                  artists: [{ name: "Artist Normalized" }],
                  preview_url: "https://cdn.example.com/normalized.mp3",
                  external_urls: { spotify: "https://open.spotify.com/track/track-normalized" },
                },
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tracks = await fetchSpotifyPlaylistTracks(
      "spotify:playlist:https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF?si=abc123",
      5,
    );
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-normalized",
      title: "Song Normalized",
      artist: "Artist Normalized",
    });
  });

  it("uses a single tracks call without pagination or market fallback", async () => {
    process.env.SPOTIFY_MARKET = "US";
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/playlists/playlist-id/tracks") {
        return Promise.resolve(
          jsonResponse({
            total: 1,
            items: [
              {
                track: {
                  id: "track-no-market",
                  name: "Song No Market",
                  artists: [{ name: "Artist No Market" }],
                  preview_url: "https://cdn.example.com/no-market.mp3",
                  external_urls: { spotify: "https://open.spotify.com/track/track-no-market" },
                },
              },
            ],
          }),
        );
      }

      return Promise.resolve(jsonResponse({}, 404));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-no-market",
      title: "Song No Market",
      artist: "Artist No Market",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(String(fetchMock.mock.calls[0]?.[0] ?? ""));
    expect(calledUrl.pathname).toBe("/v1/playlists/playlist-id/tracks");
    expect(calledUrl.searchParams.get("market")).toBeNull();
  });

  it("throws spotify rate-limited error when upstream returns 429", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              status: 429,
              message: "Too many requests",
            },
          },
          429,
          {
            "retry-after": "0",
          },
        ),
      ),
    );

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchSpotifyPlaylistTracks("playlist-id", 5)).rejects.toThrow(SPOTIFY_RATE_LIMITED_ERROR);
  });

  it("retries playlist fetch on transient 429 and succeeds", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              status: 429,
              message: "Too many requests",
            },
          },
          429,
          {
            "retry-after": "0",
          },
        ),
      ),
    ).mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          items: [
            {
              track: {
                id: "track-after-retry",
                name: "Song Retry",
                duration_ms: 180000,
                artists: [{ name: "Artist Retry" }],
                preview_url: "https://cdn.example.com/retry.mp3",
                external_urls: { spotify: "https://open.spotify.com/track/track-after-retry" },
              },
            },
          ],
        }),
      ),
    );

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tracks = await fetchSpotifyPlaylistTracks("playlist-id", 5);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "track-after-retry",
      title: "Song Retry",
      artist: "Artist Retry",
      durationSec: 180,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
