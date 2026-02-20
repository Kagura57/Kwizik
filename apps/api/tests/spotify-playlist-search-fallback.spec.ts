import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchSpotifyPlaylists } from "../src/routes/music/spotify";
import { resetSpotifyTokenCacheForTests } from "../src/routes/music/spotify-auth";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("spotify playlist search fallback", () => {
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
      delete process.env[key];
    }
    process.env.SPOTIFY_ACCESS_TOKEN = "static-token";
    process.env.SPOTIFY_BROWSE_ENABLED = "true";
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

  it("clamps spotify playlist search limit to dev-mode max (10)", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/search?")) {
        const parsed = new URL(url);
        expect(parsed.searchParams.get("limit")).toBe("10");
        return Promise.resolve(
          jsonResponse({
            playlists: {
              items: [
                {
                  id: "search-1",
                  name: "Search Hits",
                  description: "Search playlist",
                  images: [{ url: "https://cdn.example.com/search.jpg" }],
                  external_urls: { spotify: "https://open.spotify.com/playlist/search-1" },
                  owner: { display_name: "Spotify" },
                  tracks: { total: 50 },
                },
              ],
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const playlists = await searchSpotifyPlaylists("top hits", 24);
    expect(playlists).toHaveLength(1);
    expect(playlists[0]?.id).toBe("search-1");
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

      if (url.includes("/v1/playlists/")) {
        const parsed = new URL(url);
        const segments = parsed.pathname.split("/").filter(Boolean);
        const id = segments[segments.length - 1] ?? "unknown";
        return Promise.resolve(
          jsonResponse({
            id,
            name: `Metadata ${id}`,
            owner: { display_name: "Spotify" },
            tracks: { total: 42 },
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
      trackCount: 42,
    });

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.startsWith("https://open.spotify.com/search/"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("https://open.spotify.com/oembed?"))).toBe(true);
  });

  it("hydrates missing trackCount from playlist metadata", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/search?")) {
        return Promise.resolve(
          jsonResponse({
            playlists: {
              items: [
                {
                  id: "search-no-total-1",
                  name: "Search Missing Total",
                  description: "Playlist without tracks.total in payload",
                  images: [{ url: "https://cdn.example.com/search-missing.jpg" }],
                  external_urls: { spotify: "https://open.spotify.com/playlist/search-no-total-1" },
                  owner: { display_name: "Spotify" },
                  tracks: {},
                },
              ],
            },
          }),
        );
      }

      if (url.includes("/v1/playlists/search-no-total-1?")) {
        return Promise.resolve(
          jsonResponse({
            id: "search-no-total-1",
            name: "Search Missing Total",
            owner: { display_name: "Spotify" },
            tracks: { total: 88 },
          }),
        );
      }

      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const playlists = await searchSpotifyPlaylists("missing total", 5);
    expect(playlists).toHaveLength(1);
    expect(playlists[0]).toMatchObject({
      id: "search-no-total-1",
      trackCount: 88,
    });

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/v1/playlists/search-no-total-1?"))).toBe(true);
  });

  it("reads track count from items.total when provided by payload variant", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/search?")) {
        return Promise.resolve(
          jsonResponse({
            playlists: {
              items: [
                {
                  id: "search-items-total-1",
                  name: "Items Total Playlist",
                  description: "Payload variant using items.total",
                  images: [{ url: "https://cdn.example.com/search-items-total.jpg" }],
                  external_urls: { spotify: "https://open.spotify.com/playlist/search-items-total-1" },
                  owner: { display_name: "Spotify" },
                  items: { total: 142 },
                },
              ],
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const playlists = await searchSpotifyPlaylists("items total", 5);
    expect(playlists).toHaveLength(1);
    expect(playlists[0]).toMatchObject({
      id: "search-items-total-1",
      trackCount: 142,
    });
  });
});
