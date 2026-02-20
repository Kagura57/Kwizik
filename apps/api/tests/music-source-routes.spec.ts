import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import * as spotifyModule from "../src/routes/music/spotify";
import * as deezerModule from "../src/routes/music/deezer";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("music source routes", () => {
  it("returns spotify category presets", async () => {
    const response = await app.handle(new Request("http://localhost/music/spotify/categories"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      categories: Array<{ id: string; label: string; query: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.categories.length).toBeGreaterThan(0);
  });

  it("returns spotify playlists collection payload", async () => {
    const response = await app.handle(
      new Request("http://localhost/music/spotify/playlists?category=pop&limit=6"),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      playlists: Array<{ id: string; name: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.playlists.length).toBeGreaterThanOrEqual(0);
    expect(payload.playlists.length).toBeLessThanOrEqual(6);
  });

  it("returns 400 when source is missing", async () => {
    const response = await app.handle(new Request("http://localhost/music/source/resolve"));
    expect(response.status).toBe(400);
  });

  it("resolves source metadata for free search", async () => {
    const response = await app.handle(
      new Request("http://localhost/music/source/resolve?source=popular%20hits&size=6"),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      parsed: { type: string };
      count: number;
    };
    expect(payload.ok).toBe(true);
    expect(payload.parsed.type).toBe("search");
    expect(payload.count).toBeGreaterThanOrEqual(0);
    expect(payload.count).toBeLessThanOrEqual(6);
  });

  it("returns 400 when AniList users are missing", async () => {
    const response = await app.handle(new Request("http://localhost/music/anilist/titles"));
    expect(response.status).toBe(400);
  });

  it("returns merged playlist results in unified format", async () => {
    vi.spyOn(spotifyModule, "searchSpotifyPlaylists").mockResolvedValue([
      {
        id: "sp123",
        name: "Top Spotify",
        description: "desc",
        imageUrl: "https://cdn.example/sp.jpg",
        externalUrl: "https://open.spotify.com/playlist/sp123",
        owner: "Spotify",
        trackCount: 120,
      },
    ]);
    vi.spyOn(deezerModule, "searchDeezerPlaylists").mockResolvedValue([
      {
        provider: "deezer",
        id: "dz123",
        name: "Top Deezer",
        description: "desc",
        imageUrl: "https://cdn.example/dz.jpg",
        externalUrl: "https://www.deezer.com/playlist/dz123",
        owner: "Deezer",
        trackCount: 80,
      },
    ]);

    const response = await app.handle(
      new Request("http://localhost/music/playlists/search?q=top%20hits&limit=24"),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      playlists: Array<{
        provider: "spotify" | "deezer";
        id: string;
        name: string;
        trackCount: number | null;
        sourceQuery: string;
      }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.playlists.length).toBe(2);
    expect(payload.playlists[0]).toMatchObject({
      provider: "spotify",
      id: "sp123",
      trackCount: 120,
      sourceQuery: "spotify:playlist:sp123",
    });
    expect(payload.playlists[1]).toMatchObject({
      provider: "deezer",
      id: "dz123",
      trackCount: 80,
      sourceQuery: "deezer:playlist:dz123",
    });
  });

  it("keeps returning results when one provider fails", async () => {
    vi.spyOn(spotifyModule, "searchSpotifyPlaylists").mockRejectedValue(new Error("SPOTIFY_MAP_BROKEN"));
    vi.spyOn(deezerModule, "searchDeezerPlaylists").mockResolvedValue([
      {
        provider: "deezer",
        id: "dz-ok",
        name: "Deezer OK",
        description: "",
        imageUrl: null,
        externalUrl: "https://www.deezer.com/playlist/dz-ok",
        owner: "Deezer",
        trackCount: 42,
      },
    ]);

    const response = await app.handle(
      new Request("http://localhost/music/playlists/search?q=ok%20search&limit=24"),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      playlists: Array<{ provider: "spotify" | "deezer"; id: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.playlists).toEqual([
      {
        provider: "deezer",
        id: "dz-ok",
        name: "Deezer OK",
        description: "",
        imageUrl: null,
        externalUrl: "https://www.deezer.com/playlist/dz-ok",
        owner: "Deezer",
        trackCount: 42,
        sourceQuery: "deezer:playlist:dz-ok",
      },
    ]);
  });

  it("does not crash when a provider returns malformed items and still returns valid playlists", async () => {
    vi.spyOn(spotifyModule, "searchSpotifyPlaylists").mockResolvedValue([
      {
        // malformed runtime shape: previous implementation crashed on id.trim()
        id: undefined,
        name: "Broken Spotify Payload",
        description: "broken",
        imageUrl: null,
        externalUrl: "https://open.spotify.com/playlist/broken",
        owner: "spotify",
        trackCount: null,
      } as unknown as Awaited<ReturnType<typeof spotifyModule.searchSpotifyPlaylists>>[number],
      {
        id: "sp-valid",
        name: "Spotify Valid",
        description: "",
        imageUrl: null,
        externalUrl: "https://open.spotify.com/playlist/sp-valid",
        owner: "Spotify",
        trackCount: 77,
      },
    ]);
    vi.spyOn(deezerModule, "searchDeezerPlaylists").mockResolvedValue([
      {
        provider: "deezer",
        id: "dz-valid",
        name: "Deezer Valid",
        description: "",
        imageUrl: null,
        externalUrl: "https://www.deezer.com/playlist/dz-valid",
        owner: "Deezer",
        trackCount: 42,
      },
    ]);

    const response = await app.handle(
      new Request("http://localhost/music/playlists/search?q=payload%20shape&limit=24"),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      playlists: Array<{ provider: "spotify" | "deezer"; id: string; name: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.playlists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "spotify", id: "sp-valid", name: "Spotify Valid" }),
        expect.objectContaining({ provider: "deezer", id: "dz-valid", name: "Deezer Valid" }),
      ]),
    );
    expect(payload.playlists.some((item) => item.name === "Broken Spotify Payload")).toBe(false);
  });

  it("returns partial results when one provider hangs beyond timeout", async () => {
    const originalTimeout = process.env.PLAYLIST_SEARCH_PROVIDER_TIMEOUT_MS;
    process.env.PLAYLIST_SEARCH_PROVIDER_TIMEOUT_MS = "50";

    try {
      vi.spyOn(spotifyModule, "searchSpotifyPlaylists").mockImplementation(
        () => new Promise(() => {}) as ReturnType<typeof spotifyModule.searchSpotifyPlaylists>,
      );
      vi.spyOn(deezerModule, "searchDeezerPlaylists").mockResolvedValue([
        {
          provider: "deezer",
          id: "dz-fast",
          name: "Fast Deezer",
          description: "",
          imageUrl: null,
          externalUrl: "https://www.deezer.com/playlist/dz-fast",
          owner: "Deezer",
          trackCount: 55,
        },
      ]);

      const startedAt = Date.now();
      const response = await app.handle(
        new Request("http://localhost/music/playlists/search?q=timeout%20case&limit=24"),
      );
      const durationMs = Date.now() - startedAt;

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        ok: boolean;
        playlists: Array<{ provider: "spotify" | "deezer"; id: string; name: string }>;
      };
      expect(payload.ok).toBe(true);
      expect(payload.playlists).toEqual([
        expect.objectContaining({
          provider: "deezer",
          id: "dz-fast",
          name: "Fast Deezer",
        }),
      ]);
      expect(durationMs).toBeLessThan(1500);
    } finally {
      if (typeof originalTimeout === "string") {
        process.env.PLAYLIST_SEARCH_PROVIDER_TIMEOUT_MS = originalTimeout;
      } else {
        delete process.env.PLAYLIST_SEARCH_PROVIDER_TIMEOUT_MS;
      }
    }
  });
});
