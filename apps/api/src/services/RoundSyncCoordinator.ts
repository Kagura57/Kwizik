export type RoundSyncStatus = "idle" | "preparing" | "scheduled" | "playing";

export type RoundSyncSnapshot = {
  status: RoundSyncStatus;
  phaseToken: string | null;
  plannedStartAtMs: number | null;
  maxWaitUntilMs: number | null;
  mediaOffsetSec: number;
  preparedCount: number;
  requiredPreparedCount: number;
  totalPlayerCount: number;
};

type PrepareRoundInput = {
  nowMs: number;
  phaseToken: string;
  playerIds: string[];
  hostPlayerId: string | null;
  mediaOffsetSec: number;
};

type RoundSyncCoordinatorConfig = {
  startLeadMs: number;
  maxWaitMs: number;
};

export type RoundStartSchedule =
  | {
      type: "scheduled";
      startAtMs: number;
      reason: "all_ready";
    };

function requiredPreparedCount(playerIds: string[]) {
  return playerIds.length;
}

export class RoundSyncCoordinator {
  private status: RoundSyncStatus = "idle";
  private phaseToken: string | null = null;
  private plannedStartAtMs: number | null = null;
  private maxWaitUntilMs: number | null = null;
  private mediaOffsetSec = 0;
  private preparedPlayerIds = new Set<string>();
  private playerIds: string[] = [];
  private hostPlayerId: string | null = null;
  private requiredPrepared = 0;

  constructor(private readonly config: RoundSyncCoordinatorConfig) {}

  prepareRound(input: PrepareRoundInput) {
    this.status = "preparing";
    this.phaseToken = input.phaseToken;
    this.plannedStartAtMs = null;
    this.maxWaitUntilMs = null;
    this.mediaOffsetSec = Math.max(0, input.mediaOffsetSec);
    this.preparedPlayerIds.clear();
    this.playerIds = [...new Set(input.playerIds)];
    this.hostPlayerId = input.hostPlayerId;
    this.requiredPrepared = requiredPreparedCount(this.playerIds);
  }

  refreshParticipants(playerIds: string[], hostPlayerId: string | null) {
    const nextPlayerIds = [...new Set(playerIds)];
    const allowedPlayerIds = new Set(nextPlayerIds);
    this.playerIds = nextPlayerIds;
    this.hostPlayerId = hostPlayerId;
    this.requiredPrepared = requiredPreparedCount(this.playerIds);
    for (const playerId of this.preparedPlayerIds) {
      if (allowedPlayerIds.has(playerId)) continue;
      this.preparedPlayerIds.delete(playerId);
    }
  }

  markPrepared(playerId: string, _preparedAtMs: number) {
    if (this.status !== "preparing" && this.status !== "scheduled") {
      return { accepted: false as const };
    }
    if (!this.playerIds.includes(playerId)) {
      return { accepted: false as const };
    }
    if (this.preparedPlayerIds.has(playerId)) {
      return { accepted: false as const };
    }
    this.preparedPlayerIds.add(playerId);
    return { accepted: true as const };
  }

  maybeScheduleStart(nowMs: number): RoundStartSchedule | null {
    if (this.status !== "preparing") return null;
    if (this.preparedPlayerIds.size < this.requiredPrepared) return null;

    this.status = "scheduled";
    this.plannedStartAtMs = nowMs + Math.max(0, this.config.startLeadMs);
    return {
      type: "scheduled",
      startAtMs: this.plannedStartAtMs,
      reason: "all_ready",
    };
  }

  markStarted(startAtMs: number) {
    if (this.status !== "scheduled" && this.status !== "preparing") return;
    this.status = "playing";
    this.plannedStartAtMs = startAtMs;
  }

  reset() {
    this.status = "idle";
    this.phaseToken = null;
    this.plannedStartAtMs = null;
    this.maxWaitUntilMs = null;
    this.mediaOffsetSec = 0;
    this.preparedPlayerIds.clear();
    this.playerIds = [];
    this.hostPlayerId = null;
    this.requiredPrepared = 0;
  }

  snapshot(): RoundSyncSnapshot {
    return {
      status: this.status,
      phaseToken: this.phaseToken,
      plannedStartAtMs: this.plannedStartAtMs,
      maxWaitUntilMs: this.maxWaitUntilMs,
      mediaOffsetSec: this.mediaOffsetSec,
      preparedCount: this.preparedPlayerIds.size,
      requiredPreparedCount: this.requiredPrepared,
      totalPlayerCount: this.playerIds.length,
    };
  }
}
