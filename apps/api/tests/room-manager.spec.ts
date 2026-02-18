import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/services/RoomManager";

describe("RoomManager", () => {
  it("transitions waiting -> countdown on start", () => {
    const room = new RoomManager("ABCD12");
    expect(room.state()).toBe("waiting");
    room.startGame();
    expect(room.state()).toBe("countdown");
  });

  it("accepts only one answer per player per round", () => {
    const room = new RoomManager("ABCD12");
    room.startGame();
    room.forcePlayingRound(1, Date.now() + 10_000);
    const first = room.submitAnswer("p1", "song");
    const second = room.submitAnswer("p1", "song-again");
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
  });
});
