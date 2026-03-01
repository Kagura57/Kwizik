import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/services/RoomManager";

describe("RoomManager", () => {
  it("transitions waiting -> countdown -> playing -> reveal -> leaderboard -> results", () => {
    const room = new RoomManager("ABCD12");
    expect(room.state()).toBe("waiting");

    room.startGame({ nowMs: 1_000, countdownMs: 2_000, totalRounds: 1 });
    expect(room.state()).toBe("countdown");

    room.tick({ nowMs: 2_999, roundMs: 5_000, revealMs: 1_000, leaderboardMs: 1_000 });
    expect(room.state()).toBe("countdown");

    room.tick({ nowMs: 3_000, roundMs: 5_000, revealMs: 1_000, leaderboardMs: 1_000 });
    expect(room.state()).toBe("playing");
    expect(room.round()).toBe(1);

    room.tick({ nowMs: 8_000, roundMs: 5_000, revealMs: 1_000, leaderboardMs: 1_000 });
    expect(room.state()).toBe("reveal");

    room.tick({ nowMs: 9_000, roundMs: 5_000, revealMs: 1_000, leaderboardMs: 1_000 });
    expect(room.state()).toBe("leaderboard");

    room.tick({ nowMs: 10_000, roundMs: 5_000, revealMs: 1_000, leaderboardMs: 1_000 });
    expect(room.state()).toBe("results");
  });

  it("accepts only one answer per player per round", () => {
    const room = new RoomManager("ABCD12");
    room.startGame({ nowMs: 10_000, countdownMs: 0, totalRounds: 1 });
    room.tick({ nowMs: 10_000, roundMs: 10_000, revealMs: 1_000, leaderboardMs: 1_000 });
    const first = room.submitAnswer("p1", "song", 10_100);
    const second = room.submitAnswer("p1", "song-again", 10_200);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
  });

  it("promotes draft answers when round timer expires", () => {
    const room = new RoomManager("ABCD12");
    room.startGame({ nowMs: 0, countdownMs: 0, totalRounds: 1 });
    room.tick({ nowMs: 0, roundMs: 10_000, revealMs: 1_000, leaderboardMs: 1_000 });

    const draft = room.setDraftAnswer("p1", "pending title", 9_500);
    expect(draft.accepted).toBe(true);

    const tick = room.tick({ nowMs: 10_000, roundMs: 10_000, revealMs: 1_000, leaderboardMs: 1_000 });
    expect(tick.closedRounds).toHaveLength(1);
    const promoted = tick.closedRounds[0]?.answers.get("p1");
    expect(promoted?.value).toBe("pending title");
    expect(promoted?.submittedAtMs).toBe(10_000);
  });

  it("treats guess skip as done and prevents later answer submission", () => {
    const room = new RoomManager("ABCD12");
    room.startGame({ nowMs: 0, countdownMs: 0, totalRounds: 1 });
    room.tick({ nowMs: 0, roundMs: 20_000, revealMs: 20_000, leaderboardMs: 0 });

    const skipped = room.skipGuessForPlayer("p1", 1_000);
    expect(skipped.accepted).toBe(true);
    expect(room.hasGuessSkipped("p1")).toBe(true);
    expect(room.hasGuessDone("p1")).toBe(true);

    const answer = room.submitAnswer("p1", "late answer", 1_100);
    expect(answer.accepted).toBe(false);
  });

  it("accepts reveal skip votes only during reveal", () => {
    const room = new RoomManager("ABCD12");
    room.startGame({ nowMs: 0, countdownMs: 0, totalRounds: 1 });
    room.tick({ nowMs: 0, roundMs: 20_000, revealMs: 20_000, leaderboardMs: 0 });

    const invalidPlayingVote = room.skipRevealForPlayer("p1", 1_000);
    expect(invalidPlayingVote.accepted).toBe(false);

    room.expireCurrentPhase(5_000);
    room.tick({ nowMs: 5_000, roundMs: 20_000, revealMs: 20_000, leaderboardMs: 0 });
    expect(room.state()).toBe("reveal");

    const revealVote = room.skipRevealForPlayer("p1", 5_100);
    expect(revealVote.accepted).toBe(true);
    expect(room.hasRevealSkipped("p1")).toBe(true);
  });
});
