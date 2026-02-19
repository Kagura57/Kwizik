import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchSpotifyPlaylists } from "../src/routes/music/spotify";
import { resetSpotifyTokenCacheForTests } from "../src/routes/music/spotify-auth";

const readEnvVarMock = vi.fn<(key: string) => string | undefined>();

vi.mock("../src/lib/env", () => ({
  readEnvVar: (key: string) => readEnvVarMock(key),
}));

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("spotify playlist search fallback", () => {
  const envKeys = ["SPOTIFY_ACCESS_TOKEN", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"] as const;
  const originalEnv = new Map<string, string | undefined>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    readEnvVarMock.mockReset();
    readEnvVarMock.mockImplementation((key) => {
      const value = process.env[key];
      if (typeof value !== "string") return undefined;
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    });
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

  it("falls back to featured playlists when search endpoint is non-ok", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/search?")) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                status: 400,
                message: "Bad Request",
              },
            },
            400,
          ),
        );
      }

      if (url.includes("/v1/browse/featured-playlists")) {
        return Promise.resolve(
          jsonResponse({
            playlists: {
              items: [
                {
                  id: "featured-1",
                  name: "Featured Hits",
                  description: "Featured playlist",
                  images: [{ url: "https://cdn.example.com/featured.jpg" }],
                  external_urls: { spotify: "https://open.spotify.com/playlist/featured-1" },
                  owner: { display_name: "Spotify" },
                  tracks: { total: 99 },
                },
              ],
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const playlists = await searchSpotifyPlaylists("top hits", 5);
    expect(playlists).toHaveLength(1);
    expect(playlists[0]).toMatchObject({
      id: "featured-1",
      name: "Featured Hits",
      owner: "Spotify",
    });

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/v1/search?"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("/v1/browse/featured-playlists"))).toBe(true);
  });

  it("falls back to spotify web scraping when API endpoints are forbidden", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/search?") || url.includes("/v1/browse/featured-playlists")) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                status: 403,
                message: "Forbidden",
              },
            },
            403,
          ),
        );
      }

      if (url.startsWith("https://open.spotify.com/search/")) {
        return Promise.resolve(
          new Response(
            [
              "<html><body>",
              '<a href="/playlist/37i9dQZF1DXcBWIGoYBM5M">Top Hits</a>',
              '<a href="/playlist/37i9dQZF1DWY4xHQp97fN6">Rap Hits</a>',
              "</body></html>",
            ].join(""),
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        );
      }

      if (url.includes("https://open.spotify.com/oembed?")) {
        const parsed = new URL(url);
        const playlistUrl = parsed.searchParams.get("url") ?? "";
        const id = playlistUrl.split("/playlist/")[1] ?? "unknown";
        return Promise.resolve(
          jsonResponse({
            title: `Web Playlist ${id}`,
            author_name: "Spotify",
            thumbnail_url: "https://i.scdn.co/image/cover",
          }),
        );
      }

      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const playlists = await searchSpotifyPlaylists("top hits", 5);
    expect(playlists.length).toBeGreaterThan(0);
    expect(playlists[0]).toMatchObject({
      externalUrl: expect.stringContaining("open.spotify.com/playlist/"),
      owner: "Spotify",
    });

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.startsWith("https://open.spotify.com/search/"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("https://open.spotify.com/oembed?"))).toBe(true);
  });
});
