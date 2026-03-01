import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/services/RoomManager";

describe("round loop", () => {
  it("transitions through countdown -> playing -> reveal -> leaderboard", () => {
    const manager = new RoomManager("ROOM01");
    manager.startGame({ nowMs: 0, countdownMs: 3_000, totalRounds: 1 });

    manager.tick({ nowMs: 3_000, roundMs: 20_000, revealMs: 20_000, leaderboardMs: 0 });
    expect(manager.state()).toBe("playing");

    manager.tick({ nowMs: 23_000, roundMs: 20_000, revealMs: 20_000, leaderboardMs: 0 });
    expect(manager.state()).toBe("reveal");

    manager.tick({ nowMs: 43_000, roundMs: 20_000, revealMs: 20_000, leaderboardMs: 0 });
    expect(manager.state()).toBe("results");
  });
});
