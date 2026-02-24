import { pool } from "../db/client";

export type LibraryProvider = "spotify" | "deezer";

export type SyncedLibraryTrack = {
  userId: string;
  provider: LibraryProvider;
  sourceId: string;
  title: string;
  artist: string;
  durationMs: number | null;
  addedAtMs: number;
};

function memoryKey(userId: string, provider: LibraryProvider) {
  return `${userId}:${provider}`;
}

type MemoryUserLikedTrack = {
  sourceId: string;
  addedAtMs: number;
  title: string;
  artist: string;
  durationMs: number | null;
};

export class UserLikedTrackRepository {
  private readonly memoryUserTracks = new Map<string, MemoryUserLikedTrack[]>();

  private get dbEnabled() {
    const value = process.env.DATABASE_URL;
    return typeof value === "string" && value.trim().length > 0;
  }

  async replaceForUserProvider(input: {
    userId: string;
    provider: LibraryProvider;
    tracks: Array<{
      sourceId: string;
      addedAtMs: number;
      title: string;
      artist: string;
      durationMs: number | null;
    }>;
  }) {
    const userId = input.userId.trim();
    const provider = input.provider;
    if (!userId) return { savedCount: 0 };

    const normalized = input.tracks
      .map((track) => {
        const sourceId = track.sourceId.trim();
        if (!sourceId) return null;
        const addedAtMs =
          typeof track.addedAtMs === "number" && Number.isFinite(track.addedAtMs)
            ? Math.max(0, Math.floor(track.addedAtMs))
            : Date.now();
        return {
          sourceId,
          addedAtMs,
          title: track.title.trim(),
          artist: track.artist.trim(),
          durationMs:
            typeof track.durationMs === "number" && Number.isFinite(track.durationMs)
              ? Math.max(0, Math.round(track.durationMs))
              : null,
        };
      })
      .filter((track) => track !== null && track.title.length > 0 && track.artist.length > 0);

    if (!this.dbEnabled) {
      this.memoryUserTracks.set(memoryKey(userId, provider), normalized);
      return { savedCount: normalized.length };
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          delete from user_liked_tracks
          where user_id = $1 and provider = $2
        `,
        [userId, provider],
      );

      const batchSize = 500;
      for (let start = 0; start < normalized.length; start += batchSize) {
        const batch = normalized.slice(start, start + batchSize);
        const sourceIds = batch.map((track) => track.sourceId);
        const addedAts = batch.map((track) => new Date(track.addedAtMs));
        await client.query(
          `
            insert into user_liked_tracks (user_id, provider, source_id, added_at)
            select $1::text, $2::text, source_id, added_at
            from unnest($3::text[], $4::timestamptz[]) as source_rows(source_id, added_at)
          `,
          [userId, provider, sourceIds, addedAts],
        );
      }

      await client.query("commit");
      return { savedCount: normalized.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listForUsers(input: {
    userIds: string[];
    providers: LibraryProvider[];
    limit: number;
  }): Promise<SyncedLibraryTrack[]> {
    const userIds = input.userIds.map((value) => value.trim()).filter((value) => value.length > 0);
    const providers = input.providers;
    const limit = Math.max(1, Math.min(input.limit, 10_000));
    if (userIds.length <= 0 || providers.length <= 0) return [];

    if (!this.dbEnabled) {
      const rows: SyncedLibraryTrack[] = [];
      for (const userId of userIds) {
        for (const provider of providers) {
          const entries = this.memoryUserTracks.get(memoryKey(userId, provider)) ?? [];
          for (const entry of entries) {
            rows.push({
              userId,
              provider,
              sourceId: entry.sourceId,
              title: entry.title,
              artist: entry.artist,
              durationMs: entry.durationMs,
              addedAtMs: entry.addedAtMs,
            });
          }
        }
      }
      rows.sort((left, right) => right.addedAtMs - left.addedAtMs);
      return rows.slice(0, limit);
    }

    const result = await pool.query<{
      user_id: string;
      provider: string;
      source_id: string;
      added_at: Date;
      title: string;
      artist: string;
      duration_ms: number | null;
    }>(
      `
        select ult.user_id, ult.provider, ult.source_id, ult.added_at, rt.title, rt.artist, rt.duration_ms
        from user_liked_tracks ult
        inner join resolved_tracks rt
          on rt.provider = ult.provider
         and rt.source_id = ult.source_id
        where ult.user_id = any($1::text[])
          and ult.provider = any($2::text[])
        order by ult.added_at desc
        limit $3
      `,
      [userIds, providers, limit],
    );

    const tracks: SyncedLibraryTrack[] = [];
    for (const row of result.rows) {
      const provider = row.provider === "spotify" || row.provider === "deezer" ? row.provider : null;
      if (!provider) continue;
      tracks.push({
        userId: row.user_id,
        provider,
        sourceId: row.source_id,
        title: row.title,
        artist: row.artist,
        durationMs: row.duration_ms,
        addedAtMs: row.added_at.getTime(),
      });
    }
    return tracks;
  }

  clearMemory() {
    this.memoryUserTracks.clear();
  }
}

export const userLikedTrackRepository = new UserLikedTrackRepository();
