const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001";

type ApiErrorPayload = {
  error?: unknown;
};

export type RoomState = {
  roomCode: string;
  state: "waiting" | "countdown" | "playing" | "reveal" | "results";
  round: number;
  serverNowMs: number;
  playerCount: number;
  poolSize: number;
  categoryQuery: string;
};

export type RoomResults = {
  roomCode: string;
  ranking: Array<{
    rank: number;
    playerId: string;
    displayName: string;
    score: number;
    maxStreak: number;
  }>;
};

export type CreateRoomResult = {
  roomCode: string;
  source: "api" | "fallback";
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let details = `HTTP_${response.status}`;
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (typeof payload.error === "string" && payload.error.length > 0) {
        details = payload.error;
      }
    } catch {
      // Ignore payload parsing failures for non-json error responses.
    }

    throw new Error(details);
  }

  return (await response.json()) as T;
}

function localFallbackRoomCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    const char = alphabet[randomIndex];
    if (char) {
      code += char;
    }
  }
  return code;
}

export async function createRoom() {
  return requestJson<{ roomCode: string }>("/quiz/create", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function createRoomWithFallback(): Promise<CreateRoomResult> {
  try {
    const payload = await createRoom();
    if (typeof payload.roomCode === "string" && payload.roomCode.length > 0) {
      return { roomCode: payload.roomCode, source: "api" };
    }
  } catch {
    // Ignore network errors for local fallback UX.
  }

  return { roomCode: localFallbackRoomCode(), source: "fallback" };
}

export async function joinRoom(input: { roomCode: string; displayName: string }) {
  return requestJson<{ ok: true; playerId: string; playerCount: number }>("/quiz/join", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function startRoom(input: { roomCode: string; categoryQuery?: string }) {
  return requestJson<{ ok: true; state: string; poolSize: number; categoryQuery: string }>(
    "/quiz/start",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function submitRoomAnswer(input: {
  roomCode: string;
  playerId: string;
  answer: string;
}) {
  return requestJson<{ accepted: boolean }>("/quiz/answer", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getRoomState(roomCode: string) {
  return requestJson<RoomState>(`/room/${encodeURIComponent(roomCode)}/state`);
}

export async function getRoomResults(roomCode: string) {
  return requestJson<RoomResults>(`/quiz/results/${encodeURIComponent(roomCode)}`);
}
