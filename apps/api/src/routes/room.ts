import { Elysia } from "elysia";
import { roomStore } from "../services/RoomStore";

export const roomRoutes = new Elysia({ prefix: "/room" }).get("/:code/state", ({ params, set }) => {
  const snapshot = roomStore.roomState(params.code);
  if (!snapshot) {
    set.status = 404;
    return { ok: false, error: "ROOM_NOT_FOUND" };
  }

  return snapshot;
});
