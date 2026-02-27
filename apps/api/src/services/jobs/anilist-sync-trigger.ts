import { aniListSyncRunRepository } from "../../repositories/AniListSyncRunRepository";
import { enqueueAniListSyncJob, isAniListSyncQueueConfigured } from "./anilist-sync-queue";
import { runAniListSyncJob } from "./anilist-sync-worker";

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function queueAniListSyncForUser(userIdInput: unknown) {
  const userId = normalize(userIdInput);
  if (!userId) {
    return { queued: false as const, reason: "INVALID_USER_ID" as const, runId: null };
  }

  const run = await aniListSyncRunRepository.createQueued(userId);

  if (!isAniListSyncQueueConfigured()) {
    try {
      await runAniListSyncJob({
        userId,
        runId: run.id,
      });
    } catch {
      // The run status is already set to error by runAniListSyncJob.
    }
    return {
      queued: true as const,
      mode: "inline" as const,
      runId: run.id,
      jobId: null,
    };
  }

  const job = await enqueueAniListSyncJob({
    userId,
    runId: run.id,
  });

  if (!job) {
    try {
      await runAniListSyncJob({
        userId,
        runId: run.id,
      });
    } catch {
      // The run status is already set to error by runAniListSyncJob.
    }
    return {
      queued: true as const,
      mode: "inline" as const,
      runId: run.id,
      jobId: null,
    };
  }

  return {
    queued: true as const,
    mode: "bullmq" as const,
    runId: run.id,
    jobId: job.id ?? null,
  };
}
