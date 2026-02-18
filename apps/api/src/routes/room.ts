import { Elysia } from "elysia";

export const roomRoutes = new Elysia({ prefix: "/room" }).get("/:code/state", ({ params }) => ({
  roomCode: params.code,
  state: "waiting",
  round: 0,
  serverNowMs: Date.now(),
}));
