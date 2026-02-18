import { Elysia } from "elysia";
import { roomStore } from "../services/RoomStore";

function readStringField(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalStringField(body: unknown, key: string) {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const quizRoutes = new Elysia({ prefix: "/quiz" })
  .post("/create", () => roomStore.createRoom())
  .post("/join", ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const displayName = readStringField(body, "displayName");

    if (!roomCode || !displayName) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const joined = roomStore.joinRoom(roomCode, displayName);
    if (!joined) {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }

    return joined;
  })
  .post("/start", async ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const categoryQuery = readOptionalStringField(body, "categoryQuery") ?? "popular hits";
    if (!roomCode) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const started = await roomStore.startGame(roomCode, categoryQuery);
    if (!started) {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }

    return started;
  })
  .post("/answer", ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const playerId = readStringField(body, "playerId");
    const answer = readStringField(body, "answer");

    if (!roomCode || !playerId || !answer) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const result = roomStore.submitAnswer(roomCode, playerId, answer);

    if (result.status === "room_not_found") {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }

    if (result.status === "player_not_found") {
      set.status = 404;
      return { ok: false, error: "PLAYER_NOT_FOUND" };
    }

    return { accepted: result.accepted };
  })
  .get("/results/:roomCode", ({ params, set }) => {
    const results = roomStore.roomResults(params.roomCode);
    if (!results) {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }

    return results;
  });
