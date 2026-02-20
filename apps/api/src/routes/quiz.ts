import { Elysia } from "elysia";
import { readSessionFromHeaders } from "../auth/client";
import { matchRepository } from "../repositories/MatchRepository";
import { profileRepository } from "../repositories/ProfileRepository";
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

function readOptionalBooleanField(body: unknown, key: string) {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const value = record[key];
  if (typeof value === "boolean") return value;
  return null;
}

export const quizRoutes = new Elysia({ prefix: "/quiz" })
  .post("/create", ({ body }) => {
    const categoryQuery = readOptionalStringField(body, "categoryQuery");
    const isPublic = readOptionalBooleanField(body, "isPublic");
    return roomStore.createRoom({
      categoryQuery: categoryQuery ?? undefined,
      isPublic: isPublic ?? undefined,
    });
  })
  .get("/public", () => ({
    ok: true as const,
    serverNowMs: Date.now(),
    rooms: roomStore.publicRooms(),
  }))
  .post("/join", async ({ body, headers, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const displayName = readStringField(body, "displayName");

    if (!roomCode || !displayName) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const authContext = await readSessionFromHeaders(headers as unknown as Headers);
    const joined = roomStore.joinRoomAsUser(roomCode, displayName, authContext?.user.id ?? null);
    if ("status" in joined && joined.status === "room_not_found") {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }
    if ("status" in joined && joined.status === "room_not_joinable") {
      set.status = 409;
      return { ok: false, error: "ROOM_NOT_JOINABLE" };
    }

    if (authContext?.user.id) {
      await profileRepository.upsertProfile({
        userId: authContext.user.id,
        displayName,
      });
    }

    return joined;
  })
  .post("/start", async ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const playerId = readStringField(body, "playerId");
    if (!roomCode) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    if (!playerId) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const started = await roomStore.startGame(roomCode, playerId);
    if (!started) {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }

    if (started.ok === false) {
      if (started.error === "NO_TRACKS_FOUND") {
        set.status = 422;
      } else if (started.error === "PLAYER_NOT_FOUND") {
        set.status = 404;
      } else if (started.error === "HOST_ONLY") {
        set.status = 403;
      } else {
        set.status = 400;
      }
      return started;
    }

    return started;
  })
  .post("/source", ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const playerId = readStringField(body, "playerId");
    const categoryQuery = readStringField(body, "categoryQuery");
    if (!roomCode || !playerId || !categoryQuery) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const result = roomStore.setRoomSource(roomCode, playerId, categoryQuery);
    if (result.status === "room_not_found") {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }
    if (result.status === "player_not_found") {
      set.status = 404;
      return { ok: false, error: "PLAYER_NOT_FOUND" };
    }
    if (result.status === "forbidden") {
      set.status = 403;
      return { ok: false, error: "HOST_ONLY" };
    }
    if (result.status === "invalid_state") {
      set.status = 409;
      return { ok: false, error: "INVALID_STATE" };
    }
    if (result.status === "invalid_payload") {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    return { ok: true as const, categoryQuery: result.categoryQuery };
  })
  .post("/ready", ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const playerId = readStringField(body, "playerId");
    const ready = readOptionalBooleanField(body, "ready");
    if (!roomCode || !playerId || ready === null) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const result = roomStore.setPlayerReady(roomCode, playerId, ready);
    if (result.status === "room_not_found") {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }
    if (result.status === "player_not_found") {
      set.status = 404;
      return { ok: false, error: "PLAYER_NOT_FOUND" };
    }
    if (result.status === "invalid_state") {
      set.status = 409;
      return { ok: false, error: "INVALID_STATE" };
    }
    return { ok: true as const, isReady: result.isReady };
  })
  .post("/kick", ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const playerId = readStringField(body, "playerId");
    const targetPlayerId = readStringField(body, "targetPlayerId");
    if (!roomCode || !playerId || !targetPlayerId) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const result = roomStore.kickPlayer(roomCode, playerId, targetPlayerId);
    if (result.status === "room_not_found") {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }
    if (result.status === "player_not_found") {
      set.status = 404;
      return { ok: false, error: "PLAYER_NOT_FOUND" };
    }
    if (result.status === "target_not_found") {
      set.status = 404;
      return { ok: false, error: "TARGET_NOT_FOUND" };
    }
    if (result.status === "forbidden") {
      set.status = 403;
      return { ok: false, error: "HOST_ONLY" };
    }
    if (result.status === "invalid_state") {
      set.status = 409;
      return { ok: false, error: "INVALID_STATE" };
    }
    if (result.status === "invalid_payload") {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    return { ok: true as const, playerCount: result.playerCount };
  })
  .post("/leave", ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const playerId = readStringField(body, "playerId");
    if (!roomCode || !playerId) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const result = roomStore.removePlayer(roomCode, playerId);
    if (result.status === "room_not_found") {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }
    if (result.status === "player_not_found") {
      set.status = 404;
      return { ok: false, error: "PLAYER_NOT_FOUND" };
    }
    return {
      ok: true as const,
      playerCount: result.playerCount,
      hostPlayerId: result.hostPlayerId,
    };
  })
  .post("/replay", ({ body, set }) => {
    const roomCode = readStringField(body, "roomCode");
    const playerId = readStringField(body, "playerId");
    if (!roomCode || !playerId) {
      set.status = 400;
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const result = roomStore.replayRoom(roomCode, playerId);
    if (result.status === "room_not_found") {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }
    if (result.status === "player_not_found") {
      set.status = 404;
      return { ok: false, error: "PLAYER_NOT_FOUND" };
    }
    if (result.status === "forbidden") {
      set.status = 403;
      return { ok: false, error: "HOST_ONLY" };
    }
    if (result.status === "invalid_state") {
      set.status = 409;
      return { ok: false, error: "INVALID_STATE" };
    }
    return {
      ok: true as const,
      roomCode: result.roomCode,
      state: result.state,
      playerCount: result.playerCount,
      categoryQuery: result.categoryQuery,
    };
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
  .get("/results/:roomCode", async ({ params, set }) => {
    const results = roomStore.roomResults(params.roomCode);
    if (!results) {
      set.status = 404;
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }

    if (results.state === "results") {
      await matchRepository.recordMatch({
        roomCode: results.roomCode,
        categoryQuery: results.categoryQuery,
        ranking: results.ranking,
      });
    }

    return results;
  });
