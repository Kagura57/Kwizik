import { Elysia } from "elysia";
import { readSessionFromHeaders } from "../../auth/client";
import { syncUserLikedTracksLibrary } from "../../services/UserMusicLibrary";
import type { LibraryProvider } from "../../repositories/UserLikedTrackRepository";

function readProvider(body: unknown): LibraryProvider {
  if (typeof body !== "object" || body === null) return "spotify";
  const record = body as Record<string, unknown>;
  const provider = typeof record.provider === "string" ? record.provider.trim().toLowerCase() : "spotify";
  return provider === "deezer" ? "deezer" : "spotify";
}

export const musicLibraryRoutes = new Elysia({ prefix: "/music" }).post(
  "/library/sync",
  async ({ headers, body, set }) => {
    const authContext = await readSessionFromHeaders(headers as unknown as Headers);
    if (!authContext?.user?.id) {
      set.status = 401;
      return { ok: false as const, error: "UNAUTHORIZED" };
    }

    const provider = readProvider(body);
    const synced = await syncUserLikedTracksLibrary({
      userId: authContext.user.id,
      provider,
    });

    return {
      ok: true as const,
      provider: synced.provider,
      fetchedCount: synced.fetchedCount,
      uniqueCount: synced.uniqueCount,
      savedCount: synced.savedCount,
      providerTotal: synced.providerTotal,
    };
  },
);
