import { describe, expect, it } from "vitest";
import { RoundSyncCoordinator } from "../src/services/RoundSyncCoordinator";

describe("RoundSyncCoordinator", () => {
  it("schedules a shared start only when every active player is prepared", () => {
    const sync = new RoundSyncCoordinator({
      startLeadMs: 900,
      maxWaitMs: 2_000,
    });

    sync.prepareRound({
      nowMs: 10_000,
      phaseToken: "phase-1",
      playerIds: ["p1", "p2", "p3"],
      hostPlayerId: "p1",
      mediaOffsetSec: 12,
    });

    sync.markPrepared("p1", 10_150);
    sync.markPrepared("p2", 10_250);

    expect(sync.maybeScheduleStart(10_250)).toBeNull();
    sync.markPrepared("p3", 10_350);

    const scheduled = sync.maybeScheduleStart(10_350);
    expect(scheduled).toEqual({
      type: "scheduled",
      startAtMs: 11_250,
      reason: "all_ready",
    });
    expect(sync.snapshot()).toEqual(
      expect.objectContaining({
        status: "scheduled",
        phaseToken: "phase-1",
        preparedCount: 3,
        requiredPreparedCount: 3,
      }),
    );
  });

  it("never schedules from timeout alone when a player is still missing", () => {
    const sync = new RoundSyncCoordinator({
      startLeadMs: 900,
      maxWaitMs: 2_000,
    });

    sync.prepareRound({
      nowMs: 20_000,
      phaseToken: "phase-2",
      playerIds: ["p1", "p2", "p3", "p4"],
      hostPlayerId: "p1",
      mediaOffsetSec: 0,
    });

    sync.markPrepared("p1", 20_100);
    sync.markPrepared("p2", 20_200);

    expect(sync.maybeScheduleStart(21_900)).toBeNull();
    expect(sync.maybeScheduleStart(22_000)).toBeNull();
    expect(sync.snapshot().plannedStartAtMs).toBeNull();
  });
});
