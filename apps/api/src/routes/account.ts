import { Elysia } from "elysia";
import { readSessionFromHeaders } from "../auth/client";
import { aniListSyncRunRepository } from "../repositories/AniListSyncRunRepository";
import { musicAccountRepository, type MusicProvider } from "../repositories/MusicAccountRepository";
import { matchRepository } from "../repositories/MatchRepository";
import { profileRepository, type TitlePreference } from "../repositories/ProfileRepository";
import { userAnimeLibraryRepository } from "../repositories/UserAnimeLibraryRepository";
import { userLibrarySyncRepository } from "../repositories/UserLibrarySyncRepository";
import {
  buildAniListConnectUrl,
  getAniListLinkForUser,
  handleAniListOAuthCallback,
  setAniListUsernameForUser,
} from "../services/AniListOAuthService";
import { queueAniListSyncForUser } from "../services/jobs/anilist-sync-trigger";
import { buildMusicConnectUrl, handleMusicOAuthCallback } from "../services/MusicOAuthService";
import { fetchUserLikedTracks, fetchUserPlaylists } from "../services/UserMusicLibrary";

async function requireSession(headers: unknown, set: { status: number }) {
  const authContext = await readSessionFromHeaders(headers as Headers);
  if (!authContext) {
    set.status = 401;
    return null;
  }
  return authContext;
}

function parseProvider(raw: string): MusicProvider | null {
  if (raw === "spotify" || raw === "deezer") return raw;
  return null;
}

function parseLimit(raw: string | undefined, fallback: number) {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 200));
}

function parseTitlePreference(raw: string): TitlePreference | null {
  if (raw === "romaji" || raw === "english" || raw === "mixed") return raw;
  return null;
}

function parseAniListLibraryLimit(raw: string | undefined, fallback: number) {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 5_000));
}

function readStringField(body: unknown, key: string) {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string") return "";
  return value.trim();
}

export const accountRoutes = new Elysia({ prefix: "/account" })
  .get("/me", async ({ headers, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }

    const profile = await profileRepository.getProfile(authContext.user.id);

    return {
      ok: true as const,
      session: authContext.session,
      user: authContext.user,
      profile,
    };
  })
  .get("/preferences/title", async ({ headers, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const profile = await profileRepository.getProfile(authContext.user.id);
    return {
      ok: true as const,
      titlePreference: profile?.titlePreference ?? ("mixed" as const),
    };
  })
  .post("/preferences/title", async ({ headers, body, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const rawPreference = readStringField(body, "titlePreference");
    const titlePreference = parseTitlePreference(rawPreference);
    if (!titlePreference) {
      set.status = 400;
      return { ok: false as const, error: "INVALID_TITLE_PREFERENCE" as const };
    }

    const existing = await profileRepository.getProfile(authContext.user.id);
    if (!existing) {
      await profileRepository.upsertProfile({
        userId: authContext.user.id,
        displayName: authContext.user.name,
      });
    }
    const updated = await profileRepository.updateTitlePreference(authContext.user.id, titlePreference);

    return {
      ok: true as const,
      titlePreference: updated?.titlePreference ?? titlePreference,
    };
  })
  .get("/history", async ({ headers, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }

    const [history, profile] = await Promise.all([
      matchRepository.getUserHistory(authContext.user.id),
      profileRepository.getProfile(authContext.user.id),
    ]);

    return {
      ok: true as const,
      user: authContext.user,
      profile,
      history,
    };
  })
  .get("/anilist/connect/start", async ({ headers, query, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const useLegacyOAuth = query.legacy === "1";
    if (!useLegacyOAuth) {
      set.status = 410;
      return { ok: false as const, error: "USE_USERNAME_FLOW" as const };
    }
    const connect = buildAniListConnectUrl({
      userId: authContext.user.id,
      returnTo: typeof query.returnTo === "string" ? query.returnTo : null,
    });
    if (!connect) {
      set.status = 503;
      return { ok: false as const, error: "PROVIDER_NOT_CONFIGURED" as const };
    }
    return {
      ok: true as const,
      provider: "anilist" as const,
      authorizeUrl: connect.url,
    };
  })
  .post("/anilist/username", async ({ headers, body, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const requestedUsername = readStringField(body, "username");
    if (requestedUsername.length > 0 && !/^[A-Za-z0-9_-]{1,50}$/.test(requestedUsername.replace(/^@+/, ""))) {
      set.status = 400;
      return { ok: false as const, error: "INVALID_ANILIST_USERNAME" as const };
    }

    const link = await setAniListUsernameForUser({
      userId: authContext.user.id,
      username: requestedUsername.length > 0 ? requestedUsername : null,
    });

    return {
      ok: true as const,
      provider: "anilist" as const,
      status: link?.anilistUsername ? ("linked" as const) : ("not_linked" as const),
      link: link
        ? {
            anilistUserId: link.anilistUserId,
            anilistUsername: link.anilistUsername,
            expiresAtMs: link.expiresAtMs,
            updatedAtMs: link.updatedAtMs,
          }
        : null,
    };
  })
  .get("/anilist/link", async ({ headers, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }

    const link = await getAniListLinkForUser(authContext.user.id);
    const status = link?.anilistUsername ? "linked" : "not_linked";

    return {
      ok: true as const,
      provider: "anilist" as const,
      status,
      link: link
        ? {
            anilistUserId: link.anilistUserId,
            anilistUsername: link.anilistUsername,
            expiresAtMs: link.expiresAtMs,
            updatedAtMs: link.updatedAtMs,
          }
        : null,
    };
  })
  .get("/anilist/connect/callback", async ({ query, set }) => {
    const code = typeof query.code === "string" ? query.code.trim() : "";
    const state = typeof query.state === "string" ? query.state.trim() : "";
    if (!code || !state) {
      set.status = 400;
      return "Missing OAuth code/state.";
    }

    const result = await handleAniListOAuthCallback({
      code,
      state,
    });
    const target = result.returnTo?.trim() ?? "";
    const redirect = target.length > 0 ? target : "/";
    set.headers["content-type"] = "text/html; charset=utf-8";
    return `<!doctype html><html><body><script>const message=${JSON.stringify(
      { source: "kwizik-anilist-oauth", provider: "anilist", ok: result.ok },
    )};if(window.opener){window.opener.postMessage(message,"*");window.close();}else{window.location.replace(${JSON.stringify(redirect)});}</script></body></html>`;
  })
  .post("/anilist/sync", async ({ headers, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const link = await getAniListLinkForUser(authContext.user.id);
    if (!link?.anilistUsername) {
      set.status = 409;
      return { ok: false as const, error: "ANILIST_USERNAME_NOT_SET" as const };
    }
    const queued = await queueAniListSyncForUser(authContext.user.id);
    if (!queued.queued) {
      set.status = 503;
      return {
        ok: false as const,
        error: queued.reason,
        runId: queued.runId,
      };
    }
    set.status = 202;
    return {
      ok: true as const,
      status: "accepted" as const,
      runId: queued.runId,
      jobId: queued.jobId,
    };
  })
  .get("/anilist/sync/status", async ({ headers, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const run = await aniListSyncRunRepository.latestByUser(authContext.user.id);
    return {
      ok: true as const,
      run,
    };
  })
  .get("/anilist/library", async ({ headers, query, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }

    const limit = parseAniListLibraryLimit(typeof query.limit === "string" ? query.limit : undefined, 5_000);
    const rows = await userAnimeLibraryRepository.listDetailedByUser(authContext.user.id, limit);

    return {
      ok: true as const,
      total: rows.length,
      items: rows.map((row) => {
        const preferredTitle =
          row.titleRomaji?.trim() || row.titleEnglish?.trim() || row.titleNative?.trim() || `Anime #${row.animeId}`;
        return {
          animeId: row.animeId,
          title: preferredTitle,
          titleRomaji: row.titleRomaji,
          titleEnglish: row.titleEnglish,
          titleNative: row.titleNative,
          listStatus: row.listStatus,
          syncedAtMs: row.syncedAtMs,
        };
      }),
    };
  })
  .get("/music/providers", async ({ headers, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }

    const links = await musicAccountRepository.listLinkStatuses(authContext.user.id);
    return {
      ok: true as const,
      providers: links,
    };
  })
  .get("/music/:provider/connect/start", async ({ headers, params, query, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const provider = parseProvider(params.provider);
    if (!provider) {
      set.status = 400;
      return { ok: false, error: "INVALID_PROVIDER" };
    }
    const connect = buildMusicConnectUrl({
      provider,
      userId: authContext.user.id,
      returnTo: typeof query.returnTo === "string" ? query.returnTo : null,
    });
    if (!connect) {
      set.status = 503;
      return { ok: false, error: "PROVIDER_NOT_CONFIGURED" };
    }
    return {
      ok: true as const,
      provider,
      authorizeUrl: connect.url,
    };
  })
  .get("/music/:provider/connect/callback", async ({ params, query, set }) => {
    const provider = parseProvider(params.provider);
    if (!provider) {
      set.status = 400;
      return { ok: false, error: "INVALID_PROVIDER" };
    }
    const code = typeof query.code === "string" ? query.code.trim() : "";
    const state = typeof query.state === "string" ? query.state.trim() : "";
    if (!code || !state) {
      set.status = 400;
      return "Missing OAuth code/state.";
    }

    const result = await handleMusicOAuthCallback({
      provider,
      code,
      state,
    });
    const success = result.ok;
    const target = result.returnTo?.trim() ?? "";
    const redirect = target.length > 0 ? target : "/";
    set.headers["content-type"] = "text/html; charset=utf-8";
    return `<!doctype html><html><body><script>const message=${JSON.stringify(
      { source: "kwizik-music-oauth", provider, ok: success },
    )};if(window.opener){window.opener.postMessage(message,"*");window.close();}else{window.location.replace(${JSON.stringify(redirect)});}</script></body></html>`;
  })
  .post("/music/:provider/disconnect", async ({ headers, params, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const provider = parseProvider(params.provider);
    if (!provider) {
      set.status = 400;
      return { ok: false, error: "INVALID_PROVIDER" };
    }

    await musicAccountRepository.deleteLink(authContext.user.id, provider);
    if (provider === "spotify") {
      await userLibrarySyncRepository.upsert({
        userId: authContext.user.id,
        status: "idle",
        progress: 0,
        totalTracks: 0,
        lastError: null,
        startedAtMs: null,
        completedAtMs: null,
      });
    }
    const providers = await musicAccountRepository.listLinkStatuses(authContext.user.id);
    return {
      ok: true as const,
      providers,
    };
  })
  .get("/music/:provider/liked", async ({ headers, params, query, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const provider = parseProvider(params.provider);
    if (!provider) {
      set.status = 400;
      return { ok: false, error: "INVALID_PROVIDER" };
    }
    const limit = parseLimit(typeof query.limit === "string" ? query.limit : undefined, 80);
    const payload = await fetchUserLikedTracks(authContext.user.id, provider, limit);
    return {
      ok: true as const,
      provider,
      tracks: payload.tracks,
      total: payload.total,
    };
  })
  .get("/music/:provider/playlists", async ({ headers, params, query, set }) => {
    const authContext = await requireSession(headers as unknown, set);
    if (!authContext) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    const provider = parseProvider(params.provider);
    if (!provider) {
      set.status = 400;
      return { ok: false, error: "INVALID_PROVIDER" };
    }
    const limit = parseLimit(typeof query.limit === "string" ? query.limit : undefined, 30);
    const playlists = await fetchUserPlaylists(authContext.user.id, provider, limit);
    return {
      ok: true as const,
      provider,
      playlists,
    };
  });
