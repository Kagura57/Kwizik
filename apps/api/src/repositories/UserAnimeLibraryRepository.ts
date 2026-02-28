import { pool } from "../db/client";

export type UserAnimeLibraryRow = {
  userId: string;
  animeId: number;
  listStatus: "WATCHING" | "COMPLETED";
  syncedAtMs: number;
};

export type UserAnimeLibraryDetailedRow = UserAnimeLibraryRow & {
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
};

type StagingRow = {
  userId: string;
  animeId: number;
  listStatus: "WATCHING" | "COMPLETED";
};

function isDbEnabled() {
  const value = process.env.DATABASE_URL;
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStatus(input: string): "WATCHING" | "COMPLETED" {
  return input === "WATCHING" ? "WATCHING" : "COMPLETED";
}

export class UserAnimeLibraryRepository {
  private readonly memoryActiveByUser = new Map<string, UserAnimeLibraryRow[]>();

  private readonly memoryStagingByRun = new Map<number, StagingRow[]>();

  async setStagingForRun(input: {
    runId: number;
    userId: string;
    entries: Array<{ animeId: number; listStatus: "WATCHING" | "COMPLETED" }>;
  }) {
    const runId = Math.max(1, Math.floor(input.runId));
    const userId = input.userId.trim();
    if (!userId) return;

    if (!isDbEnabled()) {
      const rows = input.entries
        .map((entry) => ({
          userId,
          animeId: Math.max(1, Math.floor(entry.animeId)),
          listStatus: entry.listStatus,
        }))
        .filter((entry) => Number.isFinite(entry.animeId));
      this.memoryStagingByRun.set(runId, rows);
      return;
    }

    await pool.query("delete from anilist_sync_staging where run_id = $1 and user_id = $2", [runId, userId]);

    if (input.entries.length <= 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let index = 1;
    for (const entry of input.entries) {
      placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3})`);
      values.push(runId, userId, Math.max(1, Math.floor(entry.animeId)), entry.listStatus);
      index += 4;
    }

    await pool.query(
      `
        insert into anilist_sync_staging (run_id, user_id, anime_id, list_status)
        values ${placeholders.join(", ")}
        on conflict (run_id, anime_id)
        do update set
          user_id = excluded.user_id,
          list_status = excluded.list_status
      `,
      values,
    );
  }

  async replaceFromStaging(input: { runId: number; userId: string }) {
    const runId = Math.max(1, Math.floor(input.runId));
    const userId = input.userId.trim();
    if (!userId) return;

    if (!isDbEnabled()) {
      const staged = this.memoryStagingByRun.get(runId) ?? [];
      const nowMs = Date.now();
      const nextRows = staged
        .filter((row) => row.userId === userId)
        .map((row) => ({
          userId,
          animeId: row.animeId,
          listStatus: row.listStatus,
          syncedAtMs: nowMs,
        } satisfies UserAnimeLibraryRow));
      this.memoryActiveByUser.set(userId, nextRows);
      return;
    }

    await pool.query("begin");
    try {
      await pool.query("delete from user_anime_library_active where user_id = $1", [userId]);
      await pool.query(
        `
          insert into user_anime_library_active (user_id, anime_id, list_status, synced_at)
          select user_id, anime_id, list_status, now()
          from anilist_sync_staging
          where run_id = $1 and user_id = $2
        `,
        [runId, userId],
      );
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }

  async listByUser(userId: string, limit = 200) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return [];
    const safeLimit = Math.max(1, Math.min(limit, 5_000));

    if (!isDbEnabled()) {
      return (this.memoryActiveByUser.get(normalizedUserId) ?? []).slice(0, safeLimit);
    }

    const result = await pool.query<{
      user_id: string;
      anime_id: number;
      list_status: string;
      synced_at: Date;
    }>(
      `
        select user_id, anime_id, list_status, synced_at
        from user_anime_library_active
        where user_id = $1
        order by synced_at desc
        limit $2
      `,
      [normalizedUserId, safeLimit],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      animeId: row.anime_id,
      listStatus: normalizeStatus(row.list_status),
      syncedAtMs: row.synced_at.getTime(),
    } satisfies UserAnimeLibraryRow));
  }

  async listDetailedByUser(userId: string, limit = 5_000) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return [];
    const safeLimit = Math.max(1, Math.min(limit, 5_000));

    if (!isDbEnabled()) {
      return (this.memoryActiveByUser.get(normalizedUserId) ?? []).slice(0, safeLimit).map((row) => ({
        ...row,
        titleRomaji: null,
        titleEnglish: null,
        titleNative: null,
      }));
    }

    const result = await pool.query<{
      user_id: string;
      anime_id: number;
      list_status: string;
      synced_at: Date;
      title_romaji: string | null;
      title_english: string | null;
      title_native: string | null;
    }>(
      `
        select
          ua.user_id,
          ua.anime_id,
          ua.list_status,
          ua.synced_at,
          aa.title_romaji,
          aa.title_english,
          aa.title_native
        from user_anime_library_active ua
        join anime_catalog_anime aa on aa.id = ua.anime_id
        where ua.user_id = $1
        order by
          coalesce(nullif(aa.title_romaji, ''), nullif(aa.title_english, ''), nullif(aa.title_native, ''), ua.anime_id::text) asc,
          ua.anime_id asc
        limit $2
      `,
      [normalizedUserId, safeLimit],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      animeId: row.anime_id,
      listStatus: normalizeStatus(row.list_status),
      syncedAtMs: row.synced_at.getTime(),
      titleRomaji: row.title_romaji,
      titleEnglish: row.title_english,
      titleNative: row.title_native,
    } satisfies UserAnimeLibraryDetailedRow));
  }

  async unionAnimeIdsForUsers(userIds: string[], limit = 20_000) {
    const cleanUsers = Array.from(new Set(userIds.map((value) => value.trim()).filter((value) => value.length > 0)));
    const safeLimit = Math.max(1, Math.min(limit, 50_000));

    if (cleanUsers.length <= 0) return [];

    if (!isDbEnabled()) {
      const ids = new Set<number>();
      for (const userId of cleanUsers) {
        for (const row of this.memoryActiveByUser.get(userId) ?? []) {
          ids.add(row.animeId);
          if (ids.size >= safeLimit) break;
        }
        if (ids.size >= safeLimit) break;
      }
      return [...ids];
    }

    const result = await pool.query<{ anime_id: number }>(
      `
        with union_anime as (
          select distinct anime_id
          from user_anime_library_active
          where user_id = any($1::text[])
        )
        select anime_id
        from union_anime
        order by random()
        limit $2
      `,
      [cleanUsers, safeLimit],
    );

    return result.rows.map((row) => row.anime_id);
  }
}

export const userAnimeLibraryRepository = new UserAnimeLibraryRepository();
