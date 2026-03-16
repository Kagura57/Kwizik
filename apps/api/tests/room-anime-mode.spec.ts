import { describe, expect, it } from "vitest";
import { RoomStore } from "../src/services/RoomStore";

describe("room anime source mode", () => {
  it("allows host to switch to anilist_union mode", () => {
    const store = new RoomStore();
    const created = store.createRoom();
    const joined = store.joinRoom(created.roomCode, "Host");

    expect(joined.status).toBe("ok");
    if (joined.status !== "ok") return;

    const result = store.setRoomSourceMode(created.roomCode, joined.value.playerId, "anilist_union");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.mode).toBe("anilist_union");
  });

  it("allows host to switch to random_classic mode", () => {
    const store = new RoomStore();
    const created = store.createRoom();
    const joined = store.joinRoom(created.roomCode, "Host");
    expect(joined.status).toBe("ok");
    if (joined.status !== "ok") return;

    const result = store.setRoomSourceMode(created.roomCode, joined.value.playerId, "random_classic" as never);
    expect(result).toMatchObject({ status: "ok", mode: "random_classic" });
    expect(store.roomState(created.roomCode)?.categoryQuery).toBe("anilist:random:classic");
  });
});
