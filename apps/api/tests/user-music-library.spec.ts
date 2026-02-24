import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUserLikedTracks } from "../src/services/UserMusicLibrary";
import { musicAccountRepository } from "../src/repositories/MusicAccountRepository";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("spotify liked tracks fetching", () => {
  const userId = "spotify-liked-user";
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    await musicAccountRepository.deleteLink(userId, "spotify");
    await musicAccountRepository.upsertLink({
      userId,
      provider: "spotify",
      accessToken: "valid-access-token",
      refreshToken: "valid-refresh-token",
      scope: "user-library-read",
      expiresAtMs: Date.now() + 60 * 60_000,
    });
    globalThis.fetch = originalFetch;
  });

  afterEach(async () => {
    await musicAccountRepository.deleteLink(userId, "spotify");
    if (typeof originalDatabaseUrl === "string") {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("maps nested items[].track and keeps tracks when preview_url is null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            added_at: "2026-02-24T00:00:00.000Z",
            track: {
              id: "track-1",
              name: "First Song",
              artists: [{ name: "First Artist" }],
              preview_url: null,
              external_urls: { spotify: "https://open.spotify.com/track/track-1" },
            },
          },
          {
            added_at: "2026-02-24T00:00:01.000Z",
            track: {
              id: "track-2",
              name: "Second Song",
              artists: [{ name: "Second Artist" }],
              preview_url: null,
              external_urls: { spotify: "https://open.spotify.com/track/track-2" },
            },
          },
        ],
        total: 2,
        next: null,
      }),
    ) as unknown as typeof fetch;

    const payload = await fetchUserLikedTracks(userId, "spotify", 20);
    expect(payload.total).toBe(2);
    expect(payload.tracks).toHaveLength(2);
    expect(payload.tracks[0]).toMatchObject({
      provider: "spotify",
      id: "track-1",
      title: "First Song",
      artist: "First Artist",
      previewUrl: null,
      sourceUrl: "https://open.spotify.com/track/track-1",
    });
    expect(payload.tracks[1]).toMatchObject({
      provider: "spotify",
      id: "track-2",
      title: "Second Song",
      artist: "Second Artist",
      previewUrl: null,
      sourceUrl: "https://open.spotify.com/track/track-2",
    });
  });

  it("logs spotify /me/tracks status with first item payload", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            track: {
              id: "track-log",
              name: "Log Song",
              artists: [{ name: "Log Artist" }],
              preview_url: null,
            },
          },
        ],
        total: 1,
        next: null,
      }),
    ) as unknown as typeof fetch;

    await fetchUserLikedTracks(userId, "spotify", 1);

    const debugEntry = logSpy.mock.calls.find(
      (call) => call[0] === "========== [spotify-liked-debug] /me/tracks raw_response ==========",
    );
    expect(debugEntry).toBeTruthy();
    expect(debugEntry?.[1]).toMatchObject({
      status: 200,
      itemCount: 1,
    });
    expect((debugEntry?.[1] as { firstItem?: string }).firstItem).toContain("\"track\"");
    expect((debugEntry?.[1] as { firstItem?: string }).firstItem).toContain("\"id\": \"track-log\"");
  });
});
