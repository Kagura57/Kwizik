import { RoomManager } from "./RoomManager";

type GameState = "waiting" | "countdown" | "playing" | "reveal" | "results";

type Player = {
  id: string;
  displayName: string;
  score: number;
  maxStreak: number;
};

type RoomSession = {
  roomCode: string;
  manager: RoomManager;
  players: Map<string, Player>;
  nextPlayerNumber: number;
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRoomCode(length = 6): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    const char = ROOM_CODE_ALPHABET[randomIndex];
    if (char) {
      code += char;
    }
  }
  return code;
}

export class RoomStore {
  private readonly rooms = new Map<string, RoomSession>();

  createRoom() {
    let roomCode = randomRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = randomRoomCode();
    }

    const session: RoomSession = {
      roomCode,
      manager: new RoomManager(roomCode),
      players: new Map(),
      nextPlayerNumber: 1,
    };

    this.rooms.set(roomCode, session);
    return { roomCode };
  }

  joinRoom(roomCode: string, displayName: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;

    const playerId = `p${session.nextPlayerNumber}`;
    session.nextPlayerNumber += 1;

    const player: Player = {
      id: playerId,
      displayName,
      score: 0,
      maxStreak: 0,
    };

    session.players.set(playerId, player);

    return {
      ok: true as const,
      playerId,
      playerCount: session.players.size,
    };
  }

  startGame(roomCode: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;

    session.manager.startGame();

    return {
      ok: true as const,
      state: session.manager.state(),
    };
  }

  submitAnswer(roomCode: string, playerId: string, answer: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };

    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };

    const result = session.manager.submitAnswer(playerId, answer);
    return { status: "ok" as const, accepted: result.accepted };
  }

  roomState(roomCode: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;

    return {
      roomCode: session.roomCode,
      state: session.manager.state() as GameState,
      round: session.manager.round(),
      serverNowMs: Date.now(),
      playerCount: session.players.size,
    };
  }

  roomResults(roomCode: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;

    const ranking = [...session.players.values()]
      .sort((a, b) => b.score - a.score || b.maxStreak - a.maxStreak)
      .map((player, index) => ({
        rank: index + 1,
        playerId: player.id,
        displayName: player.displayName,
        score: player.score,
        maxStreak: player.maxStreak,
      }));

    return {
      roomCode: session.roomCode,
      ranking,
    };
  }
}

export const roomStore = new RoomStore();
