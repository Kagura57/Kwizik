import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import * as authClientModule from "../src/auth/client";
import * as userMusicLibraryModule from "../src/services/UserMusicLibrary";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("music library sync routes", () => {
  it("returns unauthorized when no session is present", async () => {
    const response = await app.handle(
      new Request("http://localhost/music/library/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ provider: "spotify" }),
      }),
    );
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { ok: boolean; error: string };
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("UNAUTHORIZED");
  });

  it("syncs spotify liked tracks for authenticated users", async () => {
    vi.spyOn(authClientModule, "readSessionFromHeaders").mockResolvedValue({
      session: {
        id: "session-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 60_000),
      },
      user: {
        id: "user-1",
        name: "User One",
        email: "user@example.com",
      },
    });
    const syncSpy = vi.spyOn(userMusicLibraryModule, "syncUserLikedTracksLibrary").mockResolvedValue({
      provider: "spotify",
      fetchedCount: 120,
      uniqueCount: 118,
      savedCount: 118,
      providerTotal: 350,
    });

    const response = await app.handle(
      new Request("http://localhost/music/library/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ provider: "spotify" }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      provider: string;
      fetchedCount: number;
      uniqueCount: number;
      savedCount: number;
      providerTotal: number | null;
    };
    expect(payload.ok).toBe(true);
    expect(payload.provider).toBe("spotify");
    expect(payload.savedCount).toBe(118);
    expect(syncSpy).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "spotify",
    });
  });
});
