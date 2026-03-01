import { describe, expect, it, vi } from "vitest";

vi.mock("../src/services/JapaneseRomanizer", () => ({
  getRomanizedJapaneseCached: (value: string) => {
    const map: Record<string, string> = {
      "夜のドライブ": "yoru no doraibu",
      "光のシグナル": "hikari no shigunaru",
      "蒼いメモリー": "aoi memori",
      "風のリズム": "kaze no rizumu",
      "ミライ": "mirai",
      "ハルカ": "haruka",
      "ユナ": "yuna",
      "アオイ": "aoi",
    };
    return map[value] ?? null;
  },
  scheduleRomanizeJapanese: () => undefined,
}));

import { RoomStore } from "../src/services/RoomStore";
import type { MusicTrack } from "../src/services/music-types";

const JAPANESE_TRACKS: MusicTrack[] = [
  {
    provider: "youtube",
    id: "jp-1",
    title: "夜のドライブ",
    artist: "ミライ",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=jp-1",
  },
  {
    provider: "youtube",
    id: "jp-2",
    title: "光のシグナル",
    artist: "ハルカ",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=jp-2",
  },
  {
    provider: "youtube",
    id: "jp-3",
    title: "蒼いメモリー",
    artist: "ユナ",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=jp-3",
  },
  {
    provider: "youtube",
    id: "jp-4",
    title: "風のリズム",
    artist: "アオイ",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=jp-4",
  },
];

describe("RoomStore romaji answer matching", () => {
  it("accepts text answers written in romaji for japanese tracks", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => JAPANESE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 40,
        revealMs: 5,
        leaderboardMs: 5,
        baseScore: 1_000,
        maxRounds: 2,
      },
    });

    const created = store.createRoom();
    const player = store.joinRoom(created.roomCode, "Host");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, player.value.playerId, "jp test");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, player.value.playerId, true);
    expect(ready.status).toBe("ok");
    const started = await store.startGame(created.roomCode, player.value.playerId);
    expect(started?.ok).toBe(true);

    const nextState = () => store.roomState(created.roomCode);
    const advanceTo = (predicate: (state: ReturnType<typeof store.roomState>) => boolean, maxSteps = 20) => {
      for (let step = 0; step < maxSteps; step += 1) {
        const current = nextState();
        if (predicate(current)) return current;
        const deadline = current?.deadlineMs ?? null;
        nowMs = deadline !== null ? deadline + 1 : nowMs + 50;
      }
      return nextState();
    };

    nowMs = 5;
    const round1 = advanceTo((state) => state?.state === "playing" && state.round === 1);
    expect(round1?.state).toBe("playing");
    expect(round1?.mode).toBe("mcq");
    const firstChoice = round1?.choices?.[0]?.value ?? "";
    store.submitAnswer(created.roomCode, player.value.playerId, firstChoice);

    const round2 = advanceTo((state) => state?.state === "playing" && state.round === 2);
    expect(round2?.state).toBe("playing");
    expect(round2?.mode).toBe("text");

    const round2Track = JAPANESE_TRACKS.find((track) => track.id === round2?.media?.trackId);
    expect(round2Track).toBeDefined();
    const romajiByArtist: Record<string, string> = {
      "ミライ": "mirai",
      "ハルカ": "haruka",
      "ユナ": "yuna",
      "アオイ": "aoi",
    };
    const romajiArtist = round2Track?.artist ? romajiByArtist[round2Track.artist] : undefined;
    expect(romajiArtist).toBeDefined();
    if (!romajiArtist) return;
    store.submitAnswer(created.roomCode, player.value.playerId, romajiArtist);

    const resultsState = advanceTo((state) => state?.state === "results");
    expect(resultsState?.state).toBe("results");
    const results = store.roomResults(created.roomCode);

    expect(results?.state).toBe("results");
    expect((results?.ranking?.[0]?.score ?? 0) > 0).toBe(true);
  });
});
