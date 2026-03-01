import { pool } from "../db/client";

export type AniListSyncRunStatus = "queued" | "running" | "success" | "error";

export type AniListSyncRun = {
  id: number;
  userId: string;
  status: AniListSyncRunStatus;
  progress: number;
  message: string | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  createdAtMs: number;
};

function isDbEnabled() {
  const value = process.env.DATABASE_URL;
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusOrDefault(value: string | null | undefined): AniListSyncRunStatus {
  if (value === "queued" || value === "running" || value === "success" || value === "error") return value;
  return "queued";
}

export class AniListSyncRunRepository {
  private nextId = 1;

  private readonly memory = new Map<number, AniListSyncRun>();

  private rowsForUser(userId: string) {
    return [...this.memory.values()]
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
  }

  async createQueued(userId: string) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error("INVALID_USER_ID");
    }

    if (!isDbEnabled()) {
      const nowMs = Date.now();
      const run: AniListSyncRun = {
        id: this.nextId,
        userId: normalizedUserId,
        status: "queued",
        progress: 0,
        message: null,
        startedAtMs: null,
        finishedAtMs: null,
        createdAtMs: nowMs,
      };
      this.memory.set(this.nextId, run);
      this.nextId += 1;
      return run;
    }

    const result = await pool.query<{
      id: number;
      user_id: string;
      status: string;
      progress: number;
      message: string | null;
      started_at: Date | null;
      finished_at: Date | null;
      created_at: Date;
    }>(
      `
        insert into anilist_sync_runs
          (user_id, status, progress, message, started_at, finished_at, created_at)
        values
          ($1, 'queued', 0, null, null, null, now())
        returning id, user_id, status, progress, message, started_at, finished_at, created_at
      `,
      [normalizedUserId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("ANILIST_SYNC_RUN_CREATE_FAILED");
    }

    return {
      id: row.id,
      userId: row.user_id,
      status: statusOrDefault(row.status),
      progress: normalizeProgress(row.progress),
      message: row.message,
      startedAtMs: row.started_at ? row.started_at.getTime() : null,
      finishedAtMs: row.finished_at ? row.finished_at.getTime() : null,
      createdAtMs: row.created_at.getTime(),
    } satisfies AniListSyncRun;
  }

  async update(input: {
    runId: number;
    status?: AniListSyncRunStatus;
    progress?: number;
    message?: string | null;
    startedAtMs?: number | null;
    finishedAtMs?: number | null;
  }) {
    const runId = Math.max(1, Math.floor(input.runId));

    if (!isDbEnabled()) {
      const existing = this.memory.get(runId);
      if (!existing) return null;
      const next: AniListSyncRun = {
        ...existing,
        status: input.status ?? existing.status,
        progress: input.progress === undefined ? existing.progress : normalizeProgress(input.progress),
        message: input.message === undefined ? existing.message : input.message,
        startedAtMs: input.startedAtMs === undefined ? existing.startedAtMs : input.startedAtMs,
        finishedAtMs: input.finishedAtMs === undefined ? existing.finishedAtMs : input.finishedAtMs,
      };
      this.memory.set(runId, next);
      return next;
    }

    const result = await pool.query<{
      id: number;
      user_id: string;
      status: string;
      progress: number;
      message: string | null;
      started_at: Date | null;
      finished_at: Date | null;
      created_at: Date;
    }>(
      `
        update anilist_sync_runs
        set
          status = coalesce($2, status),
          progress = coalesce($3, progress),
          message = $4,
          started_at = coalesce($5, started_at),
          finished_at = coalesce($6, finished_at)
        where id = $1
        returning id, user_id, status, progress, message, started_at, finished_at, created_at
      `,
      [
        runId,
        input.status ?? null,
        input.progress === undefined ? null : normalizeProgress(input.progress),
        input.message === undefined ? null : input.message,
        input.startedAtMs ? new Date(input.startedAtMs) : null,
        input.finishedAtMs ? new Date(input.finishedAtMs) : null,
      ],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      status: statusOrDefault(row.status),
      progress: normalizeProgress(row.progress),
      message: row.message,
      startedAtMs: row.started_at ? row.started_at.getTime() : null,
      finishedAtMs: row.finished_at ? row.finished_at.getTime() : null,
      createdAtMs: row.created_at.getTime(),
    } satisfies AniListSyncRun;
  }

  async latestByUser(userId: string) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return null;

    if (!isDbEnabled()) {
      return this.rowsForUser(normalizedUserId)[0] ?? null;
    }

    const result = await pool.query<{
      id: number;
      user_id: string;
      status: string;
      progress: number;
      message: string | null;
      started_at: Date | null;
      finished_at: Date | null;
      created_at: Date;
    }>(
      `
        select id, user_id, status, progress, message, started_at, finished_at, created_at
        from anilist_sync_runs
        where user_id = $1
        order by created_at desc
        limit 1
      `,
      [normalizedUserId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      status: statusOrDefault(row.status),
      progress: normalizeProgress(row.progress),
      message: row.message,
      startedAtMs: row.started_at ? row.started_at.getTime() : null,
      finishedAtMs: row.finished_at ? row.finished_at.getTime() : null,
      createdAtMs: row.created_at.getTime(),
    } satisfies AniListSyncRun;
  }
}

export const aniListSyncRunRepository = new AniListSyncRunRepository();
