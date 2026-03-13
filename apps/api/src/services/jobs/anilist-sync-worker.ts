import { Worker } from "bullmq";
import IORedis from "ioredis";
import { pool } from "../../db/client";
import { readRedisUrl } from "../../lib/env";
import { logEvent } from "../../lib/logger";
import { aniListSyncRunRepository } from "../../repositories/AniListSyncRunRepository";
import { userAnimeLibraryRepository } from "../../repositories/UserAnimeLibraryRepository";
import { getAniListLinkForUser } from "../AniListOAuthService";
import {
  ANILIST_SYNC_JOB_NAME,
  ANILIST_SYNC_QUEUE_NAME,
  type AniListSyncJobPayload,
} from "./anilist-sync-queue";

type AniListCollectionPayload = {
  errors?: Array<{
    message?: string;
  }>;
  data?: {
    MediaListCollection?: {
      lists?: Array<{
        entries?: Array<{
          status?: string | null;
          media?: {
            title?: {
              romaji?: string | null;
              english?: string | null;
              native?: string | null;
            } | null;
            synonyms?: string[] | null;
            popularity?: number | null;
            seasonYear?: number | null;
            genres?: string[] | null;
          } | null;
        }>;
      }>;
    };
  };
};

let workerInstance: Worker<AniListSyncJobPayload> | null = null;
let workerConnection: IORedis | null = null;

const ANILIST_COLLECTION_QUERY = `
query ($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME, status_in: [CURRENT, COMPLETED]) {
    lists {
      entries {
        status
        media {
          title {
            romaji
            english
            native
          }
          synonyms
          popularity
          seasonYear
          genres
        }
      }
    }
  }
}
`;

function normalizeAnimeAlias(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAnimeCatalogId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export function buildAnimeAcronym(value: string) {
  const normalized = normalizeAnimeAlias(value);
  if (normalized.length <= 0) return "";
  const tokens = normalized
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (tokens.length <= 1) return "";
  const letters = tokens
    .map((part) => part[0])
    .filter((char): char is string => typeof char === "string" && char.length > 0);
  const acronym = letters.join("");
  return acronym.length >= 2 ? acronym.toUpperCase() : "";
}

export function normalizeAniListListStatus(input: string | null | undefined): "WATCHING" | "COMPLETED" | null {
  if (input === "CURRENT") return "WATCHING";
  if (input === "COMPLETED") return "COMPLETED";
  return null;
}

export function collectAniListAliasCandidates(entry: {
  media?: {
    title?: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    } | null;
    synonyms?: string[] | null;
  } | null;
}) {
  const title = entry.media?.title;
  const values = [title?.romaji, title?.english, title?.native, ...(entry.media?.synonyms ?? [])]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);
  return Array.from(new Set(values));
}

export type AniListCatalogMetadata = {
  titleEnglish: string | null;
  titleNative: string | null;
  popularity: number | null;
  year: number | null;
  genres: string[];
};

export function collectAniListCatalogMetadata(entry: {
  media?: {
    title?: {
      english?: string | null;
      native?: string | null;
    } | null;
    popularity?: number | null;
    seasonYear?: number | null;
    genres?: string[] | null;
  } | null;
}): AniListCatalogMetadata {
  const popularity =
    typeof entry.media?.popularity === "number" && Number.isFinite(entry.media.popularity)
      ? Math.max(0, Math.round(entry.media.popularity))
      : null;
  const year =
    typeof entry.media?.seasonYear === "number" && Number.isFinite(entry.media.seasonYear)
      ? Math.max(1900, Math.round(entry.media.seasonYear))
      : null;
  const genres = Array.from(
    new Set(
      (entry.media?.genres ?? [])
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  );

  return {
    titleEnglish: entry.media?.title?.english?.trim() || null,
    titleNative: entry.media?.title?.native?.trim() || null,
    popularity,
    year,
    genres,
  };
}

type AliasUpsertRow = {
  animeId: number;
  alias: string;
  normalizedAlias: string;
  aliasType: "synonym" | "acronym";
};

async function upsertAnimeAliases(rows: AliasUpsertRow[]) {
  if (rows.length <= 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let index = 1;
  for (const row of rows) {
    placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3})`);
    values.push(row.animeId, row.alias, row.normalizedAlias, row.aliasType);
    index += 4;
  }

  await pool.query(
    `
      insert into anime_catalog_alias (anime_id, alias, normalized_alias, alias_type)
      values ${placeholders.join(", ")}
      on conflict (anime_id, normalized_alias)
      do update set
        alias = excluded.alias,
        alias_type = case
          when anime_catalog_alias.alias_type = 'canonical' then anime_catalog_alias.alias_type
          else excluded.alias_type
        end
    `,
    values,
  );
}

async function fetchAniListCollection(username: string) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: ANILIST_COLLECTION_QUERY,
      variables: {
        userName: username,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`ANILIST_COLLECTION_HTTP_${response.status}`);
  }
  const payload = (await response.json()) as AniListCollectionPayload;
  const firstError = payload.errors?.find((entry) => typeof entry.message === "string")?.message ?? null;
  if (firstError) {
    if (/not\s+found/i.test(firstError)) {
      throw new Error("ANILIST_USER_NOT_FOUND");
    }
    throw new Error("ANILIST_COLLECTION_GRAPHQL_ERROR");
  }
  return payload;
}

async function mapTitlesToAnimeIds(normalizedTitles: string[]) {
  if (normalizedTitles.length <= 0) return new Map<string, number>();
  const result = await pool.query<{
    normalized_alias: string;
    anime_id: number | string;
  }>(
    `
      select normalized_alias, anime_id
      from anime_catalog_alias
      where normalized_alias = any($1::text[])
    `,
    [normalizedTitles],
  );

  const mapped = new Map<string, number>();
  for (const row of result.rows) {
    if (mapped.has(row.normalized_alias)) continue;
    const animeId = parseAnimeCatalogId(row.anime_id);
    if (!animeId) continue;
    mapped.set(row.normalized_alias, animeId);
  }
  return mapped;
}

async function countAnimeCatalogAliases() {
  const result = await pool.query<{ total: string }>("select count(*)::text as total from anime_catalog_alias");
  const value = Number.parseInt(result.rows[0]?.total ?? "0", 10);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

async function syncAniListLibrary(input: { userId: string; runId: number }) {
  const link = await getAniListLinkForUser(input.userId);
  const username = link?.anilistUsername?.trim() ?? "";
  if (!username) {
    throw new Error("ANILIST_USERNAME_NOT_SET");
  }

  const payload = await fetchAniListCollection(username);
  const lists = payload.data?.MediaListCollection?.lists ?? [];

  const staged: Array<{ animeId: number; listStatus: "WATCHING" | "COMPLETED" }> = [];
  const seen = new Set<number>();

  const collectedEntries: Array<{
    status: "WATCHING" | "COMPLETED";
    aliases: string[];
    metadata: AniListCatalogMetadata;
  }> = [];
  const normalizedToStatus = new Map<string, "WATCHING" | "COMPLETED">();
  for (const list of lists) {
    for (const entry of list.entries ?? []) {
      const status = normalizeAniListListStatus(entry.status ?? null);
      if (!status) continue;
      const aliases = collectAniListAliasCandidates(entry);
      if (aliases.length <= 0) continue;
      collectedEntries.push({
        status,
        aliases,
        metadata: collectAniListCatalogMetadata(entry),
      });
      for (const value of aliases) {
        const normalized = normalizeAnimeAlias(value);
        if (!normalized) continue;
        if (!normalizedToStatus.has(normalized)) {
          normalizedToStatus.set(normalized, status);
        }
      }
    }
  }

  const normalizedTitles = [...normalizedToStatus.keys()];
  if (process.env.DATABASE_URL && normalizedTitles.length > 0) {
    const aliasCount = await countAnimeCatalogAliases();
    if (aliasCount <= 0) {
      throw new Error("ANIME_CATALOG_EMPTY");
    }
  }
  const titleMap = process.env.DATABASE_URL ? await mapTitlesToAnimeIds(normalizedTitles) : new Map<string, number>();

  const aliasRowsByKey = new Map<string, AliasUpsertRow>();
  const pushAlias = (animeId: number, alias: string, aliasType: "synonym" | "acronym") => {
    const normalizedAlias = normalizeAnimeAlias(alias);
    if (normalizedAlias.length < 2) return;
    const key = `${animeId}:${normalizedAlias}`;
    const existing = aliasRowsByKey.get(key);
    if (existing && existing.aliasType === "acronym") return;
    aliasRowsByKey.set(key, {
      animeId,
      alias,
      normalizedAlias,
      aliasType,
    });
  };

  const catalogMetadataUpdates = new Map<number, AniListCatalogMetadata>();

  for (const entry of collectedEntries) {
    const normalizedAliases = entry.aliases
      .map((value) => normalizeAnimeAlias(value))
      .filter((value) => value.length > 0);
    const animeId = normalizedAliases.map((value) => titleMap.get(value)).find((value) => typeof value === "number");
    if (!animeId) continue;

    if (!seen.has(animeId)) {
      seen.add(animeId);
      staged.push({
        animeId,
        listStatus: entry.status,
      });
    }

    if (
      (entry.metadata.titleEnglish ||
        entry.metadata.titleNative ||
        entry.metadata.popularity !== null ||
        entry.metadata.year !== null ||
        entry.metadata.genres.length > 0) &&
      !catalogMetadataUpdates.has(animeId)
    ) {
      catalogMetadataUpdates.set(animeId, entry.metadata);
    }

    for (const alias of entry.aliases) {
      pushAlias(animeId, alias, "synonym");
      const acronym = buildAnimeAcronym(alias);
      if (acronym.length >= 2) {
        pushAlias(animeId, acronym, "acronym");
      }
    }
  }

  if (process.env.DATABASE_URL && aliasRowsByKey.size > 0) {
    await upsertAnimeAliases([...aliasRowsByKey.values()]);
  }

  if (process.env.DATABASE_URL && catalogMetadataUpdates.size > 0) {
    const updates = [...catalogMetadataUpdates.entries()];
    const BATCH = 200;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;
      for (const [animeId, metadata] of batch) {
        placeholders.push(
          `($${idx}, $${idx + 1}::text, $${idx + 2}::text, $${idx + 3}::integer, $${idx + 4}::integer, $${idx + 5}::text[])`,
        );
        values.push(
          animeId,
          metadata.titleEnglish,
          metadata.titleNative,
          metadata.popularity,
          metadata.year,
          metadata.genres,
        );
        idx += 6;
      }
      await pool.query(
        `
          update anime_catalog_anime as a set
            title_english = coalesce(v.title_english, a.title_english),
            title_native = coalesce(v.title_native, a.title_native),
            anilist_popularity = coalesce(v.anilist_popularity, a.anilist_popularity),
            year = coalesce(v.year, a.year),
            genres = case
              when coalesce(array_length(v.genres, 1), 0) > 0 then v.genres
              else a.genres
            end,
            updated_at = now()
          from (
            values ${placeholders.join(", ")}
          ) as v(id, title_english, title_native, anilist_popularity, year, genres)
          where a.id = v.id::bigint
        `,
        values,
      );
    }
  }

  await userAnimeLibraryRepository.setStagingForRun({
    runId: input.runId,
    userId: input.userId,
    entries: staged,
  });
  await userAnimeLibraryRepository.replaceFromStaging({
    runId: input.runId,
    userId: input.userId,
  });

  return {
    stagedCount: staged.length,
  };
}

export async function runAniListSyncJob(input: { userId: string; runId: number }) {
  const userId = input.userId?.trim() ?? "";
  const runId = Math.max(1, Math.floor(input.runId ?? 0));
  if (!userId || !runId) {
    throw new Error("INVALID_SYNC_PAYLOAD");
  }

  await aniListSyncRunRepository.update({
    runId,
    status: "running",
    progress: 10,
    startedAtMs: Date.now(),
  });

  try {
    const result = await syncAniListLibrary({ userId, runId });
    await aniListSyncRunRepository.update({
      runId,
      status: "success",
      progress: 100,
      message: `SYNCED_${result.stagedCount}`,
      finishedAtMs: Date.now(),
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    await aniListSyncRunRepository.update({
      runId,
      status: "error",
      progress: 0,
      message,
      finishedAtMs: Date.now(),
    });
    throw error;
  }
}

export function startAniListSyncWorker() {
  if (workerInstance) return workerInstance;
  const redisUrl = readRedisUrl();
  if (!redisUrl) {
    logEvent("warn", "anilist_sync_worker_disabled_missing_redis_url");
    return null;
  }

  workerConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  workerInstance = new Worker<AniListSyncJobPayload>(
    ANILIST_SYNC_QUEUE_NAME,
    async (job) => {
      return await runAniListSyncJob({
        userId: job.data.userId,
        runId: job.data.runId,
      });
    },
    {
      connection: workerConnection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 1_000,
      },
    },
  );

  workerInstance.on("active", (job) => {
    logEvent("info", "anilist_library_sync_job_active", {
      userId: job.data.userId,
      runId: job.data.runId,
      jobId: job.id ?? null,
      attemptsMade: job.attemptsMade,
      name: ANILIST_SYNC_JOB_NAME,
    });
  });

  workerInstance.on("completed", (job) => {
    logEvent("info", "anilist_library_sync_job_completed", {
      userId: job.data.userId,
      runId: job.data.runId,
      jobId: job.id ?? null,
      attemptsMade: job.attemptsMade,
      name: ANILIST_SYNC_JOB_NAME,
    });
  });

  workerInstance.on("failed", (job, error) => {
    logEvent("warn", "anilist_library_sync_job_failed", {
      userId: job?.data?.userId ?? null,
      runId: job?.data?.runId ?? null,
      jobId: job?.id ?? null,
      attemptsMade: job?.attemptsMade ?? 0,
      error: error?.message ?? "UNKNOWN_ERROR",
    });
  });

  return workerInstance;
}
