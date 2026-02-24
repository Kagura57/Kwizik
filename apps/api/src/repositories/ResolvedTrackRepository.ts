import { pool } from "../db/client";

type PersistedResolvedTrack = {
  provider: string;
  sourceId: string;
  title: string;
  artist: string;
  youtubeVideoId: string | null;
  durationMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
};

function memoryKey(provider: string, sourceId: string) {
  return `${provider}:${sourceId}`;
}

export class ResolvedTrackRepository {
  private readonly memoryTracks = new Map<string, PersistedResolvedTrack>();

  private get dbEnabled() {
    const value = process.env.DATABASE_URL;
    return typeof value === "string" && value.trim().length > 0;
  }

  async getBySource(provider: string, sourceId: string) {
    const normalizedProvider = provider.trim().toLowerCase();
    const normalizedSourceId = sourceId.trim();
    if (!normalizedProvider || !normalizedSourceId) return null;

    if (!this.dbEnabled) {
      const found = this.memoryTracks.get(memoryKey(normalizedProvider, normalizedSourceId)) ?? null;
      return found ? { ...found } : null;
    }

    const result = await pool.query<{
      provider: string;
      source_id: string;
      title: string;
      artist: string;
      youtube_video_id: string | null;
      duration_ms: number | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        select provider, source_id, title, artist, youtube_video_id, duration_ms, created_at, updated_at
        from resolved_tracks
        where provider = $1 and source_id = $2
        limit 1
      `,
      [normalizedProvider, normalizedSourceId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      provider: row.provider,
      sourceId: row.source_id,
      title: row.title,
      artist: row.artist,
      youtubeVideoId: row.youtube_video_id,
      durationMs: row.duration_ms,
      createdAtMs: row.created_at.getTime(),
      updatedAtMs: row.updated_at.getTime(),
    } satisfies PersistedResolvedTrack;
  }

  async upsert(input: {
    provider: string;
    sourceId: string;
    title: string;
    artist: string;
    youtubeVideoId: string | null;
    durationMs?: number | null;
  }) {
    const provider = input.provider.trim().toLowerCase();
    const sourceId = input.sourceId.trim();
    const title = input.title.trim();
    const artist = input.artist.trim();
    const youtubeVideoId = input.youtubeVideoId?.trim() ?? null;
    if (!provider || !sourceId || !title || !artist) return null;
    const durationMs =
      typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
        ? Math.max(0, Math.round(input.durationMs))
        : null;

    if (!this.dbEnabled) {
      const key = memoryKey(provider, sourceId);
      const existing = this.memoryTracks.get(key);
      const nowMs = Date.now();
      const next = {
        provider,
        sourceId,
        title,
        artist,
        youtubeVideoId: youtubeVideoId ?? existing?.youtubeVideoId ?? null,
        durationMs,
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
      } satisfies PersistedResolvedTrack;
      this.memoryTracks.set(key, next);
      return { ...next };
    }

    const result = await pool.query<{
      provider: string;
      source_id: string;
      title: string;
      artist: string;
      youtube_video_id: string | null;
      duration_ms: number | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        insert into resolved_tracks
          (provider, source_id, title, artist, youtube_video_id, duration_ms)
        values
          ($1, $2, $3, $4, $5, $6)
        on conflict (provider, source_id)
        do update set
          title = excluded.title,
          artist = excluded.artist,
          youtube_video_id = coalesce(excluded.youtube_video_id, resolved_tracks.youtube_video_id),
          duration_ms = excluded.duration_ms,
          updated_at = now()
        returning provider, source_id, title, artist, youtube_video_id, duration_ms, created_at, updated_at
      `,
      [provider, sourceId, title, artist, youtubeVideoId, durationMs],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      provider: row.provider,
      sourceId: row.source_id,
      title: row.title,
      artist: row.artist,
      youtubeVideoId: row.youtube_video_id,
      durationMs: row.duration_ms,
      createdAtMs: row.created_at.getTime(),
      updatedAtMs: row.updated_at.getTime(),
    } satisfies PersistedResolvedTrack;
  }

  async upsertSourceMetadataMany(
    rows: Array<{
      provider: string;
      sourceId: string;
      title: string;
      artist: string;
      durationMs: number | null;
    }>,
  ) {
    if (rows.length <= 0) return { upsertedCount: 0 };

    if (!this.dbEnabled) {
      const nowMs = Date.now();
      let upsertedCount = 0;
      for (const row of rows) {
        const provider = row.provider.trim().toLowerCase();
        const sourceId = row.sourceId.trim();
        const title = row.title.trim();
        const artist = row.artist.trim();
        if (!provider || !sourceId || !title || !artist) continue;
        const key = memoryKey(provider, sourceId);
        const existing = this.memoryTracks.get(key);
        this.memoryTracks.set(key, {
          provider,
          sourceId,
          title,
          artist,
          youtubeVideoId: existing?.youtubeVideoId ?? null,
          durationMs:
            typeof row.durationMs === "number" && Number.isFinite(row.durationMs)
              ? Math.max(0, Math.round(row.durationMs))
              : null,
          createdAtMs: existing?.createdAtMs ?? nowMs,
          updatedAtMs: nowMs,
        });
        upsertedCount += 1;
      }
      return { upsertedCount };
    }

    let upsertedCount = 0;
    const batchSize = 500;
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const providers: string[] = [];
      const sourceIds: string[] = [];
      const titles: string[] = [];
      const artists: string[] = [];
      const durationMss: Array<number | null> = [];
      for (const row of batch) {
        const provider = row.provider.trim().toLowerCase();
        const sourceId = row.sourceId.trim();
        const title = row.title.trim();
        const artist = row.artist.trim();
        if (!provider || !sourceId || !title || !artist) continue;
        providers.push(provider);
        sourceIds.push(sourceId);
        titles.push(title);
        artists.push(artist);
        durationMss.push(
          typeof row.durationMs === "number" && Number.isFinite(row.durationMs)
            ? Math.max(0, Math.round(row.durationMs))
            : null,
        );
      }
      if (providers.length <= 0) continue;

      const result = await pool.query(
        `
          insert into resolved_tracks (provider, source_id, title, artist, youtube_video_id, duration_ms)
          select rows.provider, rows.source_id, rows.title, rows.artist, null::text, rows.duration_ms
          from unnest(
            $1::text[],
            $2::text[],
            $3::text[],
            $4::text[],
            $5::int[]
          ) as rows(provider, source_id, title, artist, duration_ms)
          on conflict (provider, source_id)
          do update set
            title = excluded.title,
            artist = excluded.artist,
            duration_ms = excluded.duration_ms,
            updated_at = now()
        `,
        [providers, sourceIds, titles, artists, durationMss],
      );
      upsertedCount += result.rowCount ?? providers.length;
    }

    return { upsertedCount };
  }

  clearMemory() {
    this.memoryTracks.clear();
  }
}

export const resolvedTrackRepository = new ResolvedTrackRepository();
