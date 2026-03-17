import { describe, expect, it, vi } from "vitest";
import { pool } from "../src/db/client";
import { userAnimeLibraryRepository } from "../src/repositories/UserAnimeLibraryRepository";
import * as aniListLookupModule from "../src/services/AniListTitleLookup";
import { AniListRemoteFailureError } from "../src/services/AniListRandomAnimeSource";
import type { AniListRandomAnimeCandidate } from "../src/services/AniListRandomAnimeSource";
import { RoomStore } from "../src/services/RoomStore";
import type { MusicTrack } from "../src/services/music-types";

const FIXTURE_TRACKS: MusicTrack[] = [
  {
    provider: "youtube",
    id: "t1",
    title: "Alpha Song",
    artist: "Neon Waves",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=t1",
  },
  {
    provider: "youtube",
    id: "t2",
    title: "Beta Lights",
    artist: "City Echo",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=t2",
  },
  {
    provider: "youtube",
    id: "t3",
    title: "Gamma Drive",
    artist: "Polar Night",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=t3",
  },
  {
    provider: "youtube",
    id: "t4",
    title: "Delta Pulse",
    artist: "Aurora Static",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=t4",
  },
];

const YOUTUBE_ONLY_TRACKS: MusicTrack[] = [
  {
    provider: "youtube",
    id: "yt1",
    title: "Skyline",
    artist: "Future Echo",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=yt1",
  },
];

const PROMOTIONAL_MIXED_TRACKS: MusicTrack[] = [
  {
    provider: "youtube",
    id: "promo-1",
    title: "Spotify This App Best Free Music Alternative",
    artist: "Sunday Cal",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=promo-1",
  },
  {
    provider: "youtube",
    id: "clean-1",
    title: "Midnight Signal",
    artist: "Nova Tide",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=clean-1",
  },
  {
    provider: "youtube",
    id: "clean-2",
    title: "Silver Horizon",
    artist: "Nova Tide",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=clean-2",
  },
];

const MCQ_NO_REPEAT_DISTRACTOR_TRACKS: MusicTrack[] = [
  {
    provider: "youtube",
    id: "mcq-1",
    title: "Arcade Nova",
    artist: "Pulse Engine",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=mcq-1",
  },
  {
    provider: "youtube",
    id: "mcq-2",
    title: "Night Circuit",
    artist: "Solar Vibe",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=mcq-2",
  },
  {
    provider: "youtube",
    id: "mcq-3",
    title: "Chrome Drift",
    artist: "Echo Rally",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=mcq-3",
  },
  {
    provider: "youtube",
    id: "mcq-4",
    title: "Neon Axis",
    artist: "Delta Run",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=mcq-4",
  },
  {
    provider: "youtube",
    id: "mcq-5",
    title: "Hyperlane Dream",
    artist: "Vector Echo",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=mcq-5",
  },
  {
    provider: "youtube",
    id: "mcq-6",
    title: "Prism Flight",
    artist: "Ion Harbor",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=mcq-6",
  },
];

const COHERENT_LANGUAGE_TRACKS: MusicTrack[] = [
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
  {
    provider: "youtube",
    id: "jp-5",
    title: "夏のエコー",
    artist: "ナツキ",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=jp-5",
  },
  {
    provider: "youtube",
    id: "en-1",
    title: "Neon Skyline",
    artist: "Amber Vale",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=en-1",
  },
  {
    provider: "youtube",
    id: "en-2",
    title: "City Runner",
    artist: "Luca Forge",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=en-2",
  },
  {
    provider: "youtube",
    id: "en-3",
    title: "Silver Motion",
    artist: "Nora Frame",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=en-3",
  },
  {
    provider: "youtube",
    id: "en-4",
    title: "Digital Sunset",
    artist: "Mark Dune",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=en-4",
  },
  {
    provider: "youtube",
    id: "en-5",
    title: "Night Pulse",
    artist: "Evan Glow",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=en-5",
  },
];

const ANIME_ALIAS_FALLBACK_TRACKS: MusicTrack[] = [
  {
    provider: "youtube",
    id: "anime-1",
    title: "Kimetsu no Yaiba: Yuukaku-hen",
    artist: "ED",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=anime-1",
    answer: {
      canonical: "Kimetsu no Yaiba: Yuukaku-hen",
      englishTitle: null,
      aliases: [
        "Demon Slayer: Kimetsu no Yaiba Entertainment District Arc",
        "Demon Slayer: Kimetsu no Yaiba - Le quartier des plaisirs",
        "KNYYH",
      ],
    },
  },
  {
    provider: "youtube",
    id: "anime-2",
    title: "Gintama': Enchousen",
    artist: "OP3",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=anime-2",
    answer: {
      canonical: "Gintama': Enchousen",
      englishTitle: null,
      aliases: ["Gintama Season 2 Part 2", "GE"],
    },
  },
  {
    provider: "youtube",
    id: "anime-3",
    title: "One Piece",
    artist: "OP6",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=anime-3",
    answer: {
      canonical: "One Piece",
      englishTitle: null,
      aliases: ["One Piece", "One Piece: Clockwork Island Adventure"],
    },
  },
  {
    provider: "youtube",
    id: "anime-4",
    title: "Naruto",
    artist: "ED8",
    previewUrl: null,
    sourceUrl: "https://www.youtube.com/watch?v=anime-4",
    answer: {
      canonical: "Naruto",
      englishTitle: null,
      aliases: ["Naruto", "Naruto the Movie: Guardians of the Crescent Moon Kingdom"],
    },
  },
];

const ANIME_DUPLICATE_CHOICE_TRACKS: MusicTrack[] = [
  {
    provider: "animethemes",
    id: "anime-choice-1",
    title: "進撃の巨人",
    artist: "OP1",
    previewUrl: "https://v.animethemes.moe/anime-choice-1.webm",
    sourceUrl: "https://v.animethemes.moe/anime-choice-1.webm",
    answer: {
      canonical: "Shingeki no Kyojin",
      englishTitle: "Attack on Titan",
      aliases: ["Attack on Titan"],
    },
  },
  {
    provider: "animethemes",
    id: "anime-choice-2",
    title: "ワンピース",
    artist: "OP2",
    previewUrl: "https://v.animethemes.moe/anime-choice-2.webm",
    sourceUrl: "https://v.animethemes.moe/anime-choice-2.webm",
    answer: {
      canonical: "One Piece",
      englishTitle: "One Piece",
      aliases: ["One Piece"],
    },
  },
  {
    provider: "animethemes",
    id: "anime-choice-3",
    title: "ワンピース",
    artist: "OP23",
    previewUrl: "https://v.animethemes.moe/anime-choice-3.webm",
    sourceUrl: "https://v.animethemes.moe/anime-choice-3.webm",
    answer: {
      canonical: "One Piece",
      englishTitle: "One Piece",
      aliases: ["One Piece"],
    },
  },
  {
    provider: "animethemes",
    id: "anime-choice-4",
    title: "ナルト",
    artist: "ED8",
    previewUrl: "https://v.animethemes.moe/anime-choice-4.webm",
    sourceUrl: "https://v.animethemes.moe/anime-choice-4.webm",
    answer: {
      canonical: "Naruto",
      englishTitle: "Naruto",
      aliases: ["Naruto"],
    },
  },
  {
    provider: "animethemes",
    id: "anime-choice-5",
    title: "Bleach",
    artist: "OP1",
    previewUrl: "https://v.animethemes.moe/anime-choice-5.webm",
    sourceUrl: "https://v.animethemes.moe/anime-choice-5.webm",
    answer: {
      canonical: "Bleach",
      englishTitle: "Bleach",
      aliases: ["Bleach"],
    },
  },
];

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function youtubeStartFromEmbed(embedUrl: string | null | undefined) {
  if (!embedUrl) return null;
  try {
    const url = new URL(embedUrl);
    const raw = url.searchParams.get("start");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function makeAniListThemeRows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const value = offset + index + 1;
    return {
      anime_id: value,
      video_key: `theme-${value}`,
      webm_url: `https://v.animethemes.moe/theme-${value}.webm`,
      theme_type: "OP",
      theme_number: 1,
      title_romaji: `Anime ${value}`,
      title_english: `Anime EN ${value}`,
      song_title: `Song ${value}`,
      song_artists: [`Artist ${value}`],
      aliases: [`Alias ${value}`],
    };
  });
}

function makeRandomAniListCandidates(
  count: number,
  options: { animeOffset?: number; mediaOffset?: number } = {},
): AniListRandomAnimeCandidate[] {
  const animeOffset = options.animeOffset ?? 0;
  const mediaOffset = options.mediaOffset ?? 10_000;
  return Array.from({ length: count }, (_, index) => {
    const animeValue = animeOffset + index + 1;
    return {
      mediaId: mediaOffset + animeValue,
      titleRomaji: `Anime ${animeValue}`,
      titleEnglish: `Anime EN ${animeValue}`,
      titleNative: null,
      synonyms: [`Alias ${animeValue}`],
      popularity: 1_000 + animeValue,
      year: 2000 + (animeValue % 20),
      genres: animeValue % 2 === 0 ? ["Action"] : ["Adventure"],
    };
  });
}

describe("RoomStore gameplay progression", () => {
  it("runs countdown -> playing -> reveal -> leaderboard -> results and applies streak scoring", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 10,
        playingMs: 100,
        revealMs: 10,
        leaderboardMs: 10,
        baseScore: 1_000,
        maxRounds: 2,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    const guest = store.joinRoom(created.roomCode, "Guest");

    expect(host.status).toBe("ok");
    expect(guest.status).toBe("ok");
    if (host.status !== "ok" || guest.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, host.value.playerId, "popular hits");
    expect(sourceSet.status).toBe("ok");
    const hostReady = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    const guestReady = store.setPlayerReady(created.roomCode, guest.value.playerId, true);
    expect(hostReady.status).toBe("ok");
    expect(guestReady.status).toBe("ok");
    await store.startGame(created.roomCode, host.value.playerId);
    expect(store.roomState(created.roomCode)?.state).toBe("countdown");

    nowMs = 10;
    const playingRound1 = store.roomState(created.roomCode);
    expect(playingRound1?.state).toBe("playing");
    expect(playingRound1?.round).toBe(1);
    expect(playingRound1?.mode).toBe("mcq");
    expect((playingRound1?.choices ?? []).length).toBe(4);
    expect(playingRound1?.previewUrl).toBeNull();
    expect(playingRound1?.media?.provider).toBe("youtube");
    const round1Track = FIXTURE_TRACKS.find((track) => track.id === playingRound1?.media?.trackId);
    expect(round1Track).toBeDefined();
    expect(playingRound1?.media?.sourceUrl).toBe(round1Track?.sourceUrl);

    nowMs = 20;
    store.submitAnswer(
      created.roomCode,
      host.value.playerId,
      `${round1Track?.title ?? ""} - ${round1Track?.artist ?? ""}`,
    );
    nowMs = 110;
    const revealRound1 = store.roomState(created.roomCode);
    expect(revealRound1?.state).toBe("reveal");
    expect(revealRound1?.reveal?.title).toBe(round1Track?.title);
    expect(revealRound1?.reveal?.playerAnswers).toEqual([
      {
        playerId: host.value.playerId,
        displayName: "Host",
        answer: `${round1Track?.title ?? ""} - ${round1Track?.artist ?? ""}`,
        submitted: true,
        isCorrect: true,
      },
      {
        playerId: guest.value.playerId,
        displayName: "Guest",
        answer: null,
        submitted: false,
        isCorrect: false,
      },
    ]);
    expect(revealRound1?.previewUrl).toBeNull();
    expect(revealRound1?.reveal?.sourceUrl).toBe(round1Track?.sourceUrl);
    expect(revealRound1?.reveal?.embedUrl).toContain(
      `youtube.com/embed/${round1Track?.id ?? ""}`,
    );

    nowMs = 120;
    const leaderboardRound1 = store.roomState(created.roomCode);
    expect(leaderboardRound1?.state).toBe("leaderboard");
    expect((leaderboardRound1?.leaderboard ?? []).length).toBe(2);

    nowMs = 130;
    const playingRound2 = store.roomState(created.roomCode);
    expect(playingRound2?.state).toBe("playing");
    expect(playingRound2?.round).toBe(2);
    expect(playingRound2?.mode).toBe("text");
    const round2Track = FIXTURE_TRACKS.find((track) => track.id === playingRound2?.media?.trackId);
    expect(round2Track).toBeDefined();

    nowMs = 150;
    store.submitAnswer(created.roomCode, host.value.playerId, round2Track?.artist ?? "");

    nowMs = 230;
    const revealRound2 = store.roomState(created.roomCode);
    expect(revealRound2?.state).toBe("reveal");
    expect(revealRound2?.reveal?.playerAnswers).toEqual([
      {
        playerId: host.value.playerId,
        displayName: "Host",
        answer: round2Track?.artist ?? null,
        submitted: true,
        isCorrect: true,
      },
      {
        playerId: guest.value.playerId,
        displayName: "Guest",
        answer: null,
        submitted: false,
        isCorrect: false,
      },
    ]);

    nowMs = 240;
    expect(store.roomState(created.roomCode)?.state).toBe("leaderboard");

    nowMs = 250;
    expect(store.roomState(created.roomCode)?.state).toBe("results");

    const results = store.roomResults(created.roomCode);
    expect(results?.state).toBe("results");
    expect(results?.ranking).toHaveLength(2);

    const winner = results?.ranking[0];
    const loser = results?.ranking[1];

    expect(winner?.displayName).toBe("Host");
    expect(winner?.maxStreak).toBe(2);
    expect((winner?.score ?? 0) > 0).toBe(true);
    expect(loser?.displayName).toBe("Guest");
    expect(loser?.score).toBe(0);
  });

  it("moves to reveal early when all players are done via answer or skip", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 100,
        revealMs: 100,
        leaderboardMs: 0,
        maxRounds: 2,
      },
    });

    const { roomCode } = store.createRoom();
    const host = store.joinRoom(roomCode, "Host");
    const guest = store.joinRoom(roomCode, "Guest");
    expect(host.status).toBe("ok");
    expect(guest.status).toBe("ok");
    if (host.status !== "ok" || guest.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, host.value.playerId, "popular hits");
    expect(sourceSet.status).toBe("ok");
    const hostReady = store.setPlayerReady(roomCode, host.value.playerId, true);
    const guestReady = store.setPlayerReady(roomCode, guest.value.playerId, true);
    expect(hostReady.status).toBe("ok");
    expect(guestReady.status).toBe("ok");
    await store.startGame(roomCode, host.value.playerId);

    nowMs = 5;
    const playing = store.roomState(roomCode);
    expect(playing?.state).toBe("playing");
    expect(playing?.guessDoneCount).toBe(0);
    expect(playing?.guessTotalCount).toBe(2);
    const roundTrack = FIXTURE_TRACKS.find((track) => track.id === playing?.media?.trackId);
    expect(roundTrack).toBeDefined();

    nowMs = 10;
    const hostAnswer = store.submitAnswer(
      roomCode,
      host.value.playerId,
      `${roundTrack?.title ?? ""} - ${roundTrack?.artist ?? ""}`,
    );
    expect(hostAnswer.status).toBe("ok");
    if (hostAnswer.status === "ok") {
      expect(hostAnswer.accepted).toBe(true);
    }

    nowMs = 12;
    const guestSkip = store.skipCurrentRound(roomCode, guest.value.playerId);
    expect(guestSkip.status).toBe("ok");
    if (guestSkip.status === "ok") {
      expect(guestSkip.accepted).toBe(true);
      expect(guestSkip.state).toBe("reveal");
    }

    const reveal = store.roomState(roomCode);
    expect(reveal?.state).toBe("reveal");
    expect(reveal?.reveal?.title).toBe(roundTrack?.title);
  });

  it("moves to next round after unanimous reveal next votes", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 100,
        revealMs: 100,
        leaderboardMs: 0,
        maxRounds: 2,
      },
    });

    const { roomCode } = store.createRoom();
    const host = store.joinRoom(roomCode, "Host");
    const guest = store.joinRoom(roomCode, "Guest");
    expect(host.status).toBe("ok");
    expect(guest.status).toBe("ok");
    if (host.status !== "ok" || guest.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, host.value.playerId, "popular hits");
    expect(sourceSet.status).toBe("ok");
    const hostReady = store.setPlayerReady(roomCode, host.value.playerId, true);
    const guestReady = store.setPlayerReady(roomCode, guest.value.playerId, true);
    expect(hostReady.status).toBe("ok");
    expect(guestReady.status).toBe("ok");
    await store.startGame(roomCode, host.value.playerId);

    nowMs = 5;
    const playing = store.roomState(roomCode);
    expect(playing?.state).toBe("playing");
    const roundTrack = FIXTURE_TRACKS.find((track) => track.id === playing?.media?.trackId);
    expect(roundTrack).toBeDefined();

    nowMs = 10;
    store.submitAnswer(
      roomCode,
      host.value.playerId,
      `${roundTrack?.title ?? ""} - ${roundTrack?.artist ?? ""}`,
    );

    nowMs = 11;
    store.skipCurrentRound(roomCode, guest.value.playerId);
    const reveal = store.roomState(roomCode);
    expect(reveal?.state).toBe("reveal");
    expect(reveal?.revealSkipCount).toBe(0);
    expect(reveal?.revealSkipTotalCount).toBe(2);

    nowMs = 12;
    const firstVote = store.skipCurrentRound(roomCode, host.value.playerId);
    expect(firstVote.status).toBe("ok");
    if (firstVote.status === "ok") {
      expect(firstVote.accepted).toBe(true);
      expect(firstVote.state).toBe("reveal");
    }

    nowMs = 13;
    const secondVote = store.skipCurrentRound(roomCode, guest.value.playerId);
    expect(secondVote.status).toBe("ok");
    if (secondVote.status === "ok") {
      expect(secondVote.accepted).toBe(true);
      expect(secondVote.state).toBe("playing");
      expect(secondVote.round).toBe(2);
    }
  });

  it("ends game when reveal next votes are unanimous on final round", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS.slice(0, 1),
      config: {
        countdownMs: 5,
        playingMs: 100,
        revealMs: 100,
        leaderboardMs: 0,
        maxRounds: 1,
      },
    });

    const { roomCode } = store.createRoom();
    const host = store.joinRoom(roomCode, "Host");
    const guest = store.joinRoom(roomCode, "Guest");
    expect(host.status).toBe("ok");
    expect(guest.status).toBe("ok");
    if (host.status !== "ok" || guest.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, host.value.playerId, "popular hits");
    expect(sourceSet.status).toBe("ok");
    const hostReady = store.setPlayerReady(roomCode, host.value.playerId, true);
    const guestReady = store.setPlayerReady(roomCode, guest.value.playerId, true);
    expect(hostReady.status).toBe("ok");
    expect(guestReady.status).toBe("ok");
    await store.startGame(roomCode, host.value.playerId);

    nowMs = 5;
    const playing = store.roomState(roomCode);
    expect(playing?.state).toBe("playing");
    const roundTrack = FIXTURE_TRACKS.find((track) => track.id === playing?.media?.trackId);
    expect(roundTrack).toBeDefined();

    nowMs = 10;
    store.submitAnswer(
      roomCode,
      host.value.playerId,
      `${roundTrack?.title ?? ""} - ${roundTrack?.artist ?? ""}`,
    );
    nowMs = 11;
    store.skipCurrentRound(roomCode, guest.value.playerId);
    expect(store.roomState(roomCode)?.state).toBe("reveal");

    nowMs = 12;
    store.skipCurrentRound(roomCode, host.value.playerId);
    nowMs = 13;
    const finalVote = store.skipCurrentRound(roomCode, guest.value.playerId);
    expect(finalVote.status).toBe("ok");
    if (finalVote.status === "ok") {
      expect(finalVote.state).toBe("results");
    }

    expect(store.roomState(roomCode)?.state).toBe("results");
  });

  it("keeps animethemes rounds in loading until a shared start is scheduled", async () => {
    let nowMs = 0;
    const animeTrack: MusicTrack = {
      provider: "animethemes",
      id: "buffering-track",
      title: "Buffering Anime",
      artist: "OP1",
      previewUrl: "https://v.animethemes.moe/buffering-track.webm",
      sourceUrl: "https://v.animethemes.moe/buffering-track.webm",
      audioUrl: "https://v.animethemes.moe/buffering-track.webm",
      videoUrl: "https://v.animethemes.moe/buffering-track.webm",
    };

    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => [animeTrack],
      config: {
        countdownMs: 10,
        loadingMs: 100,
        loadingTimeoutMs: 10_000,
        playingMs: 200,
        revealMs: 10,
        leaderboardMs: 0,
        maxRounds: 1,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(created.roomCode) as {
      manager: {
        startGame: (input: { nowMs: number; countdownMs: number; totalRounds: number }) => boolean;
      };
      trackPool: MusicTrack[];
      totalRounds: number;
      roundModes: Array<"mcq" | "text">;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;
    session.trackPool = [animeTrack];
    session.totalRounds = 1;
    session.roundModes = ["text"];
    expect(session.manager.startGame({ nowMs: 0, countdownMs: 10, totalRounds: 1 })).toBe(true);

    nowMs = 10;
    const loading = store.roomState(created.roomCode);
    expect(loading?.state).toBe("loading");
    expect(loading?.deadlineMs).toBeNull();

    nowMs = 350;
    const stillLoading = store.roomState(created.roomCode);
    expect(stillLoading?.state).toBe("loading");
    expect(stillLoading?.mediaReadyCount).toBe(0);

    const prepared = store.reportMediaPrepared(created.roomCode, host.value.playerId, animeTrack.id);
    expect(prepared.status).toBe("ok");
    if (prepared.status === "ok") {
      expect(prepared.accepted).toBe(true);
      expect(prepared.state).toBe("loading");
      expect(prepared.deadlineMs).toBeNull();
    }

    const scheduled = store.roomState(created.roomCode);
    expect(scheduled?.state).toBe("loading");
    expect(scheduled?.roundSync.status).toBe("scheduled");
    expect(scheduled?.roundSync.preparedCount).toBe(1);
    expect(scheduled?.roundSync.plannedStartAtMs).toBe(1_250);

    nowMs = 1_249;
    expect(store.roomState(created.roomCode)?.state).toBe("loading");

    nowMs = 1_250;
    const playing = store.roomState(created.roomCode);
    expect(playing?.state).toBe("playing");
    expect(playing?.deadlineMs).toBe(1_450);
  });

  it("requires every active player before a loading round is scheduled", async () => {
    let nowMs = 0;
    const animeTrack: MusicTrack = {
      provider: "animethemes",
      id: "quorum-track",
      title: "Quorum Theme",
      artist: "OP1",
      previewUrl: "https://api.example.test/quiz/media/animethemes/quorum-track.webm",
      sourceUrl: "https://api.example.test/quiz/media/animethemes/quorum-track.webm",
      audioUrl: "https://api.example.test/quiz/media/animethemes/quorum-track.webm",
      videoUrl: "https://api.example.test/quiz/media/animethemes/quorum-track.webm",
    };

    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => [animeTrack],
      config: {
        countdownMs: 10,
        loadingMs: 100,
        loadingTimeoutMs: 10_000,
        playingMs: 200,
        revealMs: 10,
        leaderboardMs: 0,
        maxRounds: 1,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    const player2 = store.joinRoom(created.roomCode, "P2");
    const player3 = store.joinRoom(created.roomCode, "P3");
    expect(host.status).toBe("ok");
    expect(player2.status).toBe("ok");
    expect(player3.status).toBe("ok");
    if (host.status !== "ok" || player2.status !== "ok" || player3.status !== "ok") return;

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(created.roomCode) as {
      manager: {
        startGame: (input: { nowMs: number; countdownMs: number; totalRounds: number }) => boolean;
      };
      trackPool: MusicTrack[];
      totalRounds: number;
      roundModes: Array<"mcq" | "text">;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;
    session.trackPool = [animeTrack];
    session.totalRounds = 1;
    session.roundModes = ["text"];
    expect(session.manager.startGame({ nowMs: 0, countdownMs: 10, totalRounds: 1 })).toBe(true);

    nowMs = 10;
    expect(store.roomState(created.roomCode)?.state).toBe("loading");

    const hostPrepared = store.reportMediaPrepared(created.roomCode, host.value.playerId, animeTrack.id);
    expect(hostPrepared.status).toBe("ok");
    const secondPrepared = store.reportMediaPrepared(created.roomCode, player2.value.playerId, animeTrack.id);
    expect(secondPrepared.status).toBe("ok");

    const stillPreparing = store.roomState(created.roomCode);
    expect(stillPreparing?.state).toBe("loading");
    expect(stillPreparing?.roundSync.status).toBe("preparing");
    expect(stillPreparing?.roundSync.preparedCount).toBe(2);
    expect(stillPreparing?.roundSync.requiredPreparedCount).toBe(3);

    nowMs = 910;
    expect(store.roomState(created.roomCode)?.state).toBe("loading");

    const thirdPrepared = store.reportMediaPrepared(created.roomCode, player3.value.playerId, animeTrack.id);
    expect(thirdPrepared.status).toBe("ok");

    const scheduled = store.roomState(created.roomCode);
    expect(scheduled?.state).toBe("loading");
    expect(scheduled?.roundSync.status).toBe("scheduled");
    expect(scheduled?.roundSync.preparedCount).toBe(3);
    expect(scheduled?.roundSync.requiredPreparedCount).toBe(3);

    nowMs = 1_809;
    expect(store.roomState(created.roomCode)?.state).toBe("loading");

    nowMs = 1_810;
    const playing = store.roomState(created.roomCode);
    expect(playing?.state).toBe("playing");
  });

  it("keeps animethemes rounds loading until every player is prepared", async () => {
    let nowMs = 0;
    const animeTrack: MusicTrack = {
      provider: "animethemes",
      id: "timeout-track",
      title: "Timeout Anime",
      artist: "OP1",
      previewUrl: "https://api.example.test/quiz/media/animethemes/timeout-track.webm",
      sourceUrl: "https://api.example.test/quiz/media/animethemes/timeout-track.webm",
      audioUrl: "https://api.example.test/quiz/media/animethemes/timeout-track.webm",
      videoUrl: "https://api.example.test/quiz/media/animethemes/timeout-track.webm",
    };

    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => [animeTrack],
      config: {
        countdownMs: 10,
        loadingMs: 100,
        loadingTimeoutMs: 150,
        playingMs: 200,
        revealMs: 10,
        leaderboardMs: 0,
        maxRounds: 1,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(created.roomCode) as {
      manager: {
        startGame: (input: { nowMs: number; countdownMs: number; totalRounds: number }) => boolean;
      };
      trackPool: MusicTrack[];
      totalRounds: number;
      roundModes: Array<"mcq" | "text">;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;
    session.trackPool = [animeTrack];
    session.totalRounds = 1;
    session.roundModes = ["text"];
    expect(session.manager.startGame({ nowMs: 0, countdownMs: 10, totalRounds: 1 })).toBe(true);

    nowMs = 10;
    expect(store.roomState(created.roomCode)?.state).toBe("loading");

    nowMs = 120_000;
    const stillLoading = store.roomState(created.roomCode);
    expect(stillLoading?.state).toBe("loading");
    expect(stillLoading?.roundSync.status).toBe("preparing");
    expect(stillLoading?.roundSync.plannedStartAtMs).toBeNull();
  });

  it("includes round sync metadata while an animethemes round is preparing", async () => {
    let nowMs = 0;
    const animeTrack: MusicTrack = {
      provider: "animethemes",
      id: "sync-track",
      title: "Sync Anime",
      artist: "OP1",
      previewUrl: "https://api.example.test/quiz/media/animethemes/sync-track.webm",
      sourceUrl: "https://api.example.test/quiz/media/animethemes/sync-track.webm",
      audioUrl: "https://api.example.test/quiz/media/animethemes/sync-track.webm",
      videoUrl: "https://api.example.test/quiz/media/animethemes/sync-track.webm",
    };

    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => [animeTrack],
      config: {
        countdownMs: 10,
        loadingMs: 100,
        playingMs: 200,
        revealMs: 10,
        leaderboardMs: 0,
        maxRounds: 1,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(created.roomCode) as {
      manager: {
        startGame: (input: { nowMs: number; countdownMs: number; totalRounds: number }) => boolean;
      };
      trackPool: MusicTrack[];
      totalRounds: number;
      roundModes: Array<"mcq" | "text">;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;

    session.trackPool = [animeTrack];
    session.totalRounds = 1;
    session.roundModes = ["text"];
    expect(session.manager.startGame({ nowMs: 0, countdownMs: 10, totalRounds: 1 })).toBe(true);

    nowMs = 10;
    const snapshot = store.roomState(created.roomCode);
    expect(snapshot?.state).toBe("loading");
    expect(snapshot?.roundSync).toEqual(
      expect.objectContaining({
        status: "preparing",
        phaseToken: expect.any(String),
        plannedStartAtMs: null,
        preparedCount: 0,
        requiredPreparedCount: 1,
      }),
    );
  });

  it("warms the current and next animethemes tracks when a loading round is scheduled", async () => {
    let nowMs = 0;
    const warmAnimeThemeVideo = vi.fn(async () => undefined);
    const animeTrack1: MusicTrack = {
      provider: "animethemes",
      id: "warm-current.webm",
      title: "Warm Current",
      artist: "OP1",
      previewUrl: "https://api.example.test/quiz/media/animethemes/warm-current.webm",
      sourceUrl: "https://api.example.test/quiz/media/animethemes/warm-current.webm",
      audioUrl: "https://api.example.test/quiz/media/animethemes/warm-current.webm",
      videoUrl: "https://api.example.test/quiz/media/animethemes/warm-current.webm",
    };
    const animeTrack2: MusicTrack = {
      provider: "animethemes",
      id: "warm-next.webm",
      title: "Warm Next",
      artist: "OP1",
      previewUrl: "https://api.example.test/quiz/media/animethemes/warm-next.webm",
      sourceUrl: "https://api.example.test/quiz/media/animethemes/warm-next.webm",
      audioUrl: "https://api.example.test/quiz/media/animethemes/warm-next.webm",
      videoUrl: "https://api.example.test/quiz/media/animethemes/warm-next.webm",
    };

    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => [animeTrack1, animeTrack2],
      warmAnimeThemeVideo,
      config: {
        countdownMs: 10,
        loadingMs: 100,
        playingMs: 200,
        revealMs: 10,
        leaderboardMs: 0,
        maxRounds: 2,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(created.roomCode) as {
      manager: {
        startGame: (input: { nowMs: number; countdownMs: number; totalRounds: number }) => boolean;
      };
      trackPool: MusicTrack[];
      totalRounds: number;
      roundModes: Array<"mcq" | "text">;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;

    session.trackPool = [animeTrack1, animeTrack2];
    session.totalRounds = 2;
    session.roundModes = ["text", "text"];
    expect(session.manager.startGame({ nowMs: 0, countdownMs: 10, totalRounds: 2 })).toBe(true);

    nowMs = 10;
    const snapshot = store.roomState(created.roomCode);
    expect(snapshot?.state).toBe("loading");
    expect(warmAnimeThemeVideo).toHaveBeenCalledTimes(2);
    expect(warmAnimeThemeVideo).toHaveBeenNthCalledWith(1, "warm-current.webm");
    expect(warmAnimeThemeVideo).toHaveBeenNthCalledWith(2, "warm-next.webm");

    store.roomState(created.roomCode);
    expect(warmAnimeThemeVideo).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable animethemes media without skipping the current round", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      config: {
        playingMs: 100,
        revealMs: 100,
        leaderboardMs: 0,
        maxRounds: 1,
      },
    });

    const { roomCode } = store.createRoom();
    const host = store.joinRoom(roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(roomCode) as {
      manager: {
        forcePlayingRound: (round: number, deadlineMs: number, startedAtMs?: number) => void;
      };
      trackPool: MusicTrack[];
      totalRounds: number;
      roundModes: Array<"mcq" | "text">;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;

    session.trackPool = [
      {
        provider: "animethemes",
        id: "AhiruNoSora-OP2-NCBD1080",
        title: "Ahiru no Sora",
        artist: "OP2",
        previewUrl: "https://v.animethemes.moe/AhiruNoSora-OP2-NCBD1080.webm",
        sourceUrl: "https://v.animethemes.moe/AhiruNoSora-OP2-NCBD1080.webm",
      },
    ];
    session.totalRounds = 1;
    session.roundModes = ["text"];
    session.manager.forcePlayingRound(1, 100, 0);

    const before = store.roomState(roomCode);
    expect(before?.state).toBe("playing");
    expect(before?.media?.provider).toBe("animethemes");
    expect(before?.media?.trackId).toBe("AhiruNoSora-OP2-NCBD1080");

    nowMs = 5;
    const reported = await store.reportMediaUnavailable(roomCode, host.value.playerId, "AhiruNoSora-OP2-NCBD1080");
    expect(reported.status).toBe("ok");
    if (reported.status === "ok") {
      expect(reported.accepted).toBe(false);
      expect(reported.state).toBe("playing");
    }

    expect(store.roomState(roomCode)?.state).toBe("playing");
  });

  it("ignores animethemes unavailable reports for a non-active track", async () => {
    const store = new RoomStore({
      config: {
        playingMs: 100,
        revealMs: 100,
        leaderboardMs: 0,
        maxRounds: 1,
      },
    });

    const { roomCode } = store.createRoom();
    const host = store.joinRoom(roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(roomCode) as {
      manager: {
        forcePlayingRound: (round: number, deadlineMs: number, startedAtMs?: number) => void;
      };
      trackPool: MusicTrack[];
      totalRounds: number;
      roundModes: Array<"mcq" | "text">;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;

    session.trackPool = [
      {
        provider: "animethemes",
        id: "valid-track",
        title: "Valid",
        artist: "OP1",
        previewUrl: "https://v.animethemes.moe/Valid-OP1.webm",
        sourceUrl: "https://v.animethemes.moe/Valid-OP1.webm",
      },
    ];
    session.totalRounds = 1;
    session.roundModes = ["text"];
    session.manager.forcePlayingRound(1, Date.now() + 100, Date.now());

    const reported = await store.reportMediaUnavailable(roomCode, host.value.playerId, "other-track");
    expect(reported.status).toBe("ok");
    if (reported.status === "ok") {
      expect(reported.accepted).toBe(false);
      expect(reported.state).toBe("playing");
    }
  });

  it("auto-validates latest draft answer when text round ends", async () => {
    let nowMs = 0;
    const draftTrack = FIXTURE_TRACKS[0];
    if (!draftTrack) return;

    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => [draftTrack],
      config: {
        countdownMs: 10,
        playingMs: 100,
        revealMs: 10,
        leaderboardMs: 10,
        baseScore: 1_000,
        maxRounds: 1,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, host.value.playerId, "single track");
    expect(sourceSet.status).toBe("ok");
    const hostReady = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    expect(hostReady.status).toBe("ok");
    await store.startGame(created.roomCode, host.value.playerId);

    nowMs = 10;
    const playing = store.roomState(created.roomCode);
    expect(playing?.state).toBe("playing");
    expect(playing?.mode).toBe("text");

    nowMs = 80;
    const draft = store.submitDraftAnswer(created.roomCode, host.value.playerId, draftTrack.artist);
    expect(draft.status).toBe("ok");
    if (draft.status === "ok") {
      expect(draft.accepted).toBe(true);
    }

    nowMs = 110;
    const reveal = store.roomState(created.roomCode);
    expect(reveal?.state).toBe("reveal");
    expect(reveal?.reveal?.playerAnswers).toEqual([
      {
        playerId: host.value.playerId,
        displayName: "Host",
        answer: draftTrack.artist,
        submitted: true,
        isCorrect: true,
      },
    ]);
  });

  it("resets streak when a player misses a round", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 50,
        revealMs: 5,
        leaderboardMs: 5,
        baseScore: 1_000,
        maxRounds: 2,
      },
    });

    const { roomCode } = store.createRoom();
    const player = store.joinRoom(roomCode, "Solo");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, player.value.playerId, "popular hits");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(roomCode, player.value.playerId, true);
    expect(ready.status).toBe("ok");
    await store.startGame(roomCode, player.value.playerId);

    nowMs = 5;
    const playingRound1 = store.roomState(roomCode);
    const round1Track = FIXTURE_TRACKS.find((track) => track.id === playingRound1?.media?.trackId);
    nowMs = 10;
    store.submitAnswer(
      roomCode,
      player.value.playerId,
      `${round1Track?.title ?? ""} - ${round1Track?.artist ?? ""}`,
    );

    nowMs = 55;
    store.roomState(roomCode);
    nowMs = 60;
    store.roomState(roomCode);

    nowMs = 110;
    store.roomState(roomCode);
    nowMs = 115;
    store.roomState(roomCode);

    nowMs = 120;
    store.roomState(roomCode);

    const results = store.roomResults(roomCode);
    expect(results?.ranking).toHaveLength(1);
    expect(results?.ranking[0]?.maxStreak).toBe(1);
  });

  it("does not reuse previously-correct tracks as later MCQ distractors", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => MCQ_NO_REPEAT_DISTRACTOR_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 3,
      },
    });

    const { roomCode } = store.createRoom();
    const player = store.joinRoom(roomCode, "Host");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, player.value.playerId, "spotify:playlist:dummy");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(roomCode, player.value.playerId, true);
    expect(ready.status).toBe("ok");
    const started = await store.startGame(roomCode, player.value.playerId);
    expect(started?.ok).toBe(true);

    nowMs = 5;
    const round1Playing = store.roomState(roomCode);
    expect(round1Playing?.state).toBe("playing");
    expect(round1Playing?.mode).toBe("mcq");
    const round1Track = MCQ_NO_REPEAT_DISTRACTOR_TRACKS.find((track) => track.id === round1Playing?.media?.trackId);
    expect(round1Track).toBeDefined();
    const round1Label = `${round1Track?.title ?? ""} - ${round1Track?.artist ?? ""}`;

    nowMs = 30; // reveal round 1
    store.roomState(roomCode);
    nowMs = 35; // leaderboard round 1
    store.roomState(roomCode);
    nowMs = 40; // playing round 2 (text)
    const round2Playing = store.roomState(roomCode);
    expect(round2Playing?.state).toBe("playing");
    expect(round2Playing?.mode).toBe("text");

    nowMs = 65; // reveal round 2
    store.roomState(roomCode);
    nowMs = 70; // leaderboard round 2
    store.roomState(roomCode);
    nowMs = 75; // playing round 3 (mcq)
    const round3Playing = store.roomState(roomCode);
    expect(round3Playing?.state).toBe("playing");
    expect(round3Playing?.mode).toBe("mcq");
    expect((round3Playing?.choices ?? []).some((choice) => choice.value === round1Label)).toBe(false);
  });

  it("does not use future correct tracks as earlier MCQ distractors", async () => {
    let nowMs = 0;
    const animeTracks: MusicTrack[] = [
      {
        provider: "animethemes",
        id: "anime-future-1",
        title: "進撃の巨人",
        artist: "OP1",
        previewUrl: "https://v.animethemes.moe/anime-future-1.webm",
        sourceUrl: "https://v.animethemes.moe/anime-future-1.webm",
        answer: { canonical: "Shingeki no Kyojin", englishTitle: "Attack on Titan", aliases: ["Attack on Titan"] },
      },
      {
        provider: "animethemes",
        id: "anime-future-2",
        title: "鋼の錬金術師",
        artist: "OP1",
        previewUrl: "https://v.animethemes.moe/anime-future-2.webm",
        sourceUrl: "https://v.animethemes.moe/anime-future-2.webm",
        answer: { canonical: "Fullmetal Alchemist", englishTitle: "Fullmetal Alchemist", aliases: ["Fullmetal Alchemist"] },
      },
      {
        provider: "animethemes",
        id: "anime-future-3",
        title: "BLEACH",
        artist: "OP1",
        previewUrl: "https://v.animethemes.moe/anime-future-3.webm",
        sourceUrl: "https://v.animethemes.moe/anime-future-3.webm",
        answer: { canonical: "Bleach", englishTitle: "Bleach", aliases: ["Bleach"] },
      },
      {
        provider: "animethemes",
        id: "anime-future-4",
        title: "NARUTO",
        artist: "OP1",
        previewUrl: "https://v.animethemes.moe/anime-future-4.webm",
        sourceUrl: "https://v.animethemes.moe/anime-future-4.webm",
        answer: { canonical: "Naruto", englishTitle: "Naruto", aliases: ["Naruto"] },
      },
      {
        provider: "animethemes",
        id: "anime-future-5",
        title: "DEATH NOTE",
        artist: "OP1",
        previewUrl: "https://v.animethemes.moe/anime-future-5.webm",
        sourceUrl: "https://v.animethemes.moe/anime-future-5.webm",
        answer: { canonical: "Death Note", englishTitle: "Death Note", aliases: ["Death Note"] },
      },
      {
        provider: "animethemes",
        id: "anime-future-6",
        title: "Code Geass",
        artist: "OP1",
        previewUrl: "https://v.animethemes.moe/anime-future-6.webm",
        sourceUrl: "https://v.animethemes.moe/anime-future-6.webm",
        answer: { canonical: "Code Geass", englishTitle: "Code Geass", aliases: ["Code Geass"] },
      },
    ];
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => animeTracks,
      config: {
        countdownMs: 5,
        loadingMs: 0,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 2,
      },
    });

    const { roomCode } = store.createRoom();
    const player = store.joinRoom(roomCode, "Host");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, player.value.playerId, "anime:no-future-distractor");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(roomCode, player.value.playerId, true);
    expect(ready.status).toBe("ok");
    const started = await store.startGame(roomCode, player.value.playerId);
    expect(started?.ok).toBe(true);

    const roomMap = (store as unknown as {
      rooms: Map<string, { trackPool: MusicTrack[] }>;
    }).rooms;
    const session = roomMap.get(roomCode);
    const futureRoundLabel = session?.trackPool[1]
      ? `${session.trackPool[1].title} - ${session.trackPool[1].artist}`
      : null;

    const advanceTo = (predicate: (state: ReturnType<typeof store.roomState>) => boolean, maxSteps = 12) => {
      for (let step = 0; step < maxSteps; step += 1) {
        const current = store.roomState(roomCode);
        if (predicate(current)) return current;
        const deadline = current?.deadlineMs ?? null;
        nowMs = deadline !== null ? deadline + 1 : nowMs + 20;
      }
      return store.roomState(roomCode);
    };

    nowMs = 5;
    const round1Playing = advanceTo((state) => state?.state === "playing" && state.round === 1);
    expect(round1Playing?.state).toBe("playing");
    expect(round1Playing?.mode).toBe("mcq");
    expect((round1Playing?.choices ?? []).some((choice) => choice.value === futureRoundLabel)).toBe(false);
  });

  it("downgrades MCQ to text when coherent distractors are insufficient", async () => {
    let nowMs = 0;
    const singleTrack: MusicTrack[] = [
      {
        provider: "youtube",
        id: "solo-1",
        title: "Walking On A Dream",
        artist: "Empire Of The Sun",
        previewUrl: null,
        sourceUrl: "https://www.youtube.com/watch?v=solo-1",
      },
    ];
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => singleTrack,
      config: {
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 1,
      },
    });

    const { roomCode } = store.createRoom();
    const player = store.joinRoom(roomCode, "Host");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    store.setRoomSource(roomCode, player.value.playerId, "spotify:playlist:dummy");
    store.setPlayerReady(roomCode, player.value.playerId, true);
    const started = await store.startGame(roomCode, player.value.playerId);
    expect(started).toMatchObject({ ok: true });

    nowMs = 5;
    const playing = store.roomState(roomCode);
    expect(playing?.state).toBe("playing");
    expect(playing?.mode).toBe("text");
    expect(playing?.choices ?? []).toHaveLength(0);
  });

  it("builds MCQ choices with coherent language distractors when enough candidates exist", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => COHERENT_LANGUAGE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 50,
        revealMs: 5,
        leaderboardMs: 5,
        baseScore: 1_000,
        maxRounds: 1,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, host.value.playerId, "coherent language");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    expect(ready.status).toBe("ok");
    await store.startGame(created.roomCode, host.value.playerId);

    nowMs = 5;
    const playing = store.roomState(created.roomCode);
    expect(playing?.state).toBe("playing");
    const choices = playing?.choices ?? [];
    expect(choices).toHaveLength(4);

    const activeTrack = COHERENT_LANGUAGE_TRACKS.find((track) => track.id === playing?.media?.trackId);
    const correct = activeTrack ? `${activeTrack.title} - ${activeTrack.artist}` : "";
    const hasJapaneseScript = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;
    const correctIsJapanese = hasJapaneseScript.test(correct);
    const sameLanguageCount = choices.filter((choice) => hasJapaneseScript.test(choice.value) === correctIsJapanese).length;

    expect(sameLanguageCount >= 3).toBe(true);
  });

  it("deduplicates MCQ anime choices by canonical anime title", () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom();

    const roomMap = (store as unknown as { rooms: Map<string, unknown> }).rooms;
    const session = roomMap.get(roomCode) as {
      trackPool: MusicTrack[];
      distractorTrackPool: MusicTrack[];
      roundChoices: Map<number, Array<{ value: string; titleRomaji: string }>>;
    } | null;
    expect(session).not.toBeNull();
    if (!session) return;

    session.trackPool = [ANIME_DUPLICATE_CHOICE_TRACKS[0]!];
    session.distractorTrackPool = ANIME_DUPLICATE_CHOICE_TRACKS.slice(1);
    session.roundChoices = new Map();

    const choices = (
      store as unknown as {
        buildRoundChoices: (
          inputSession: typeof session,
          round: number,
        ) => Array<{ value: string; titleRomaji: string }>;
      }
    ).buildRoundChoices(session, 1);

    expect(choices).toHaveLength(4);
    expect(choices.filter((choice) => choice.titleRomaji === "ワンピース")).toHaveLength(1);
    expect(choices.some((choice) => choice.titleRomaji === "Bleach")).toBe(true);
  });

  it("falls back to an english anime alias when title_english is missing", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => ANIME_ALIAS_FALLBACK_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 50,
        revealMs: 5,
        leaderboardMs: 5,
        baseScore: 1_000,
        maxRounds: 1,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, host.value.playerId, "anime alias fallback");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    expect(ready.status).toBe("ok");
    await store.startGame(created.roomCode, host.value.playerId);

    nowMs = 5;
    const playing = store.roomState(created.roomCode);
    expect(playing?.state).toBe("playing");
    expect(playing?.choices).toHaveLength(4);

    const demonSlayerChoice = (playing?.choices ?? []).find(
      (choice) => choice.titleRomaji === "Kimetsu no Yaiba: Yuukaku-hen",
    );
    expect(demonSlayerChoice?.titleEnglish).toBe(
      "Demon Slayer: Kimetsu no Yaiba Entertainment District Arc",
    );

    const onePieceChoice = (playing?.choices ?? []).find((choice) => choice.titleRomaji === "One Piece");
    expect(onePieceChoice?.titleEnglish).toBeNull();

    const narutoChoice = (playing?.choices ?? []).find((choice) => choice.titleRomaji === "Naruto");
    expect(narutoChoice?.titleEnglish).toBeNull();
  });

  it("accepts youtube tracks without preview as playable rounds", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => YOUTUBE_ONLY_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 50,
        revealMs: 5,
        leaderboardMs: 5,
        baseScore: 1_000,
        maxRounds: 1,
      },
    });

    const { roomCode } = store.createRoom();
    const player = store.joinRoom(roomCode, "Solo");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, player.value.playerId, "youtube focus");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(roomCode, player.value.playerId, true);
    expect(ready.status).toBe("ok");
    const started = await store.startGame(roomCode, player.value.playerId);
    expect(started?.ok).toBe(true);
    expect(started && "totalRounds" in started ? started.totalRounds : 0).toBe(1);

    nowMs = 5;
    const playing = store.roomState(roomCode);
    expect(playing?.state).toBe("playing");
    expect(playing?.previewUrl).toBeNull();
    expect(playing?.media?.provider).toBe("youtube");
    expect(playing?.media?.embedUrl).toContain("youtube.com/embed/yt1");
  });

  it("uses a stable randomized youtube start offset during a round", async () => {
    let nowMs = 0;
    const timedYouTubeTrack: MusicTrack[] = [
      {
        provider: "youtube",
        id: "yt-start-1",
        title: "Late Intro Anthem",
        artist: "Signal Drive",
        durationSec: 210,
        previewUrl: null,
        sourceUrl: "https://www.youtube.com/watch?v=yt-start-1",
      },
    ];
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => timedYouTubeTrack,
      config: {
        countdownMs: 5,
        playingMs: 50,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 1,
      },
    });

    const { roomCode } = store.createRoom();
    const player = store.joinRoom(roomCode, "Solo");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, player.value.playerId, "youtube random start");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(roomCode, player.value.playerId, true);
    expect(ready.status).toBe("ok");
    await store.startGame(roomCode, player.value.playerId);

    nowMs = 5;
    const playingFirst = store.roomState(roomCode);
    const playingSecond = store.roomState(roomCode);
    const startFirst = youtubeStartFromEmbed(playingFirst?.media?.embedUrl);
    const startSecond = youtubeStartFromEmbed(playingSecond?.media?.embedUrl);
    expect(startFirst).not.toBeNull();
    expect(startSecond).toBe(startFirst);
    expect(startFirst ?? 0).toBeGreaterThanOrEqual(18);
    expect(startFirst ?? 0).toBeLessThanOrEqual(190);

    nowMs = 55;
    const reveal = store.roomState(roomCode);
    const revealStart = youtubeStartFromEmbed(reveal?.reveal?.embedUrl);
    expect(revealStart).toBe(startFirst);
  });

  it("accepts late joins while game is running", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 50,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 1,
      },
    });

    const { roomCode } = store.createRoom();
    const host = store.joinRoom(roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, host.value.playerId, "spotify:popular");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(roomCode, host.value.playerId, true);
    expect(ready.status).toBe("ok");
    await store.startGame(roomCode, host.value.playerId);
    const lateJoin = store.joinRoom(roomCode, "LatePlayer");
    expect(lateJoin.status).toBe("ok");
    if (lateJoin.status !== "ok") return;
    expect(lateJoin.value.playerCount).toBe(2);
  });

  it("filters promotional tracks from pool before starting rounds", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => PROMOTIONAL_MIXED_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 50,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 2,
      },
    });

    const { roomCode } = store.createRoom();
    const player = store.joinRoom(roomCode, "Host");
    expect(player.status).toBe("ok");
    if (player.status !== "ok") return;

    const sourceSet = store.setRoomSource(roomCode, player.value.playerId, "deezer:playlist:3155776842");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(roomCode, player.value.playerId, true);
    expect(ready.status).toBe("ok");
    const started = await store.startGame(roomCode, player.value.playerId);
    expect(started?.ok).toBe(true);
    nowMs = 5;
    const playing = store.roomState(roomCode);
    expect(playing?.state).toBe("playing");
    const label = playing?.media?.trackId ?? "";
    expect(["clean-1", "clean-2"]).toContain(label);
  });

  it("requires host but allows force start before all players are ready", async () => {
    const store = new RoomStore({
      getTrackPool: async () => FIXTURE_TRACKS,
      config: { maxRounds: 2 },
    });
    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    const guest = store.joinRoom(created.roomCode, "Guest");
    expect(host.status).toBe("ok");
    expect(guest.status).toBe("ok");
    if (host.status !== "ok" || guest.status !== "ok") return;

    const guestSource = store.setRoomSource(created.roomCode, guest.value.playerId, "popular hits");
    expect(guestSource.status).toBe("forbidden");

    const hostSource = store.setRoomSource(created.roomCode, host.value.playerId, "popular hits");
    expect(hostSource.status).toBe("ok");

    store.setPlayerReady(created.roomCode, host.value.playerId, true);
    const startedBeforeAllReady = await store.startGame(created.roomCode, host.value.playerId);
    expect(startedBeforeAllReady?.ok).toBe(true);
  });

  it("supports replay to waiting lobby and preserves players", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 1,
      },
    });
    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    const guest = store.joinRoom(created.roomCode, "Guest");
    expect(host.status).toBe("ok");
    expect(guest.status).toBe("ok");
    if (host.status !== "ok" || guest.status !== "ok") return;

    store.setRoomSource(created.roomCode, host.value.playerId, "popular hits");
    store.setPlayerReady(created.roomCode, host.value.playerId, true);
    store.setPlayerReady(created.roomCode, guest.value.playerId, true);
    await store.startGame(created.roomCode, host.value.playerId);

    nowMs = 5;
    store.roomState(created.roomCode);
    nowMs = 25;
    store.roomState(created.roomCode);
    nowMs = 30;
    store.roomState(created.roomCode);
    nowMs = 35;
    store.roomState(created.roomCode);
    expect(store.roomState(created.roomCode)?.state).toBe("results");

    const replay = store.replayRoom(created.roomCode, host.value.playerId);
    expect(replay.status).toBe("ok");
    if (replay.status !== "ok") return;
    expect(replay.state).toBe("waiting");

    const lobby = store.roomState(created.roomCode);
    expect(lobby?.state).toBe("waiting");
    expect(lobby?.players).toHaveLength(2);
    expect(lobby?.sourceMode).toBe("public_playlist");
    expect(lobby?.categoryQuery).toBe("popular hits");
    expect(lobby?.readyCount).toBe(0);
  });

  it("preserves configured room settings across replay", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
        maxRounds: 1,
      },
    });
    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    expect(
      store.setRoomPublicPlaylist(created.roomCode, host.value.playerId, {
        id: "3155776842",
        name: "Anime Hits",
        trackCount: 42,
        sourceQuery: "deezer:playlist:3155776842",
      }),
    ).toMatchObject({ status: "ok", sourceMode: "public_playlist" });
    expect(store.setRoomThemeMode(created.roomCode, host.value.playerId, "ed_only")).toMatchObject({
      status: "ok",
      mode: "ed_only",
    });
    expect(store.setRoomDifficultyFilter(created.roomCode, host.value.playerId, "hard")).toMatchObject({
      status: "ok",
      filter: "hard",
    });
    expect(
      store.setRoomContentFilters(created.roomCode, host.value.playerId, {
        decades: [2010],
        genres: ["Action"],
      }),
    ).toMatchObject({
      status: "ok",
      contentFilters: { decades: [2010], genres: ["Action"] },
    });
    expect(store.setRoomAnswerMode(created.roomCode, host.value.playerId, "text_only")).toMatchObject({
      status: "ok",
      mode: "text_only",
    });
    expect(
      store.setRoomLivesMode(created.roomCode, host.value.playerId, {
        livesMode: true,
        maxLives: 2,
      }),
    ).toMatchObject({
      status: "ok",
      livesMode: true,
      maxLives: 2,
    });
    expect(
      store.setRoomRoundConfig(created.roomCode, host.value.playerId, {
        maxRounds: 2,
        playingMs: 7_000,
        revealMs: 4_000,
      }),
    ).toMatchObject({
      status: "ok",
      config: { maxRounds: 2, playingMs: 7_000, revealMs: 4_000 },
    });

    store.setPlayerReady(created.roomCode, host.value.playerId, true);
    await store.startGame(created.roomCode, host.value.playerId);

    for (let step = 0; step < 10; step += 1) {
      nowMs += 8_000;
      const snapshot = store.roomState(created.roomCode);
      if (snapshot?.state === "results") break;
    }
    expect(store.roomState(created.roomCode)?.state).toBe("results");

    const replay = store.replayRoom(created.roomCode, host.value.playerId);
    expect(replay).toMatchObject({
      status: "ok",
      state: "waiting",
      categoryQuery: "deezer:playlist:3155776842",
    });

    const lobby = store.roomState(created.roomCode);
    expect(lobby).toMatchObject({
      state: "waiting",
      sourceMode: "public_playlist",
      categoryQuery: "deezer:playlist:3155776842",
      answerMode: "text_only",
      livesMode: true,
      maxLives: 2,
      roomRoundConfig: {
        maxRounds: 2,
        playingMs: 7_000,
        revealMs: 4_000,
      },
      sourceConfig: {
        mode: "public_playlist",
        themeMode: "ed_only",
        difficultyFilter: "hard",
        contentFilters: {
          decades: [2010],
          genres: ["Action"],
        },
        publicPlaylist: {
          provider: "deezer",
          id: "3155776842",
          name: "Anime Hits",
          trackCount: 42,
          sourceQuery: "deezer:playlist:3155776842",
          selectedByPlayerId: host.value.playerId,
        },
      },
    });
    expect(lobby?.players[0]?.lives).toBe(2);
    expect(lobby?.readyCount).toBe(0);
  });

  it("applies the AniList difficulty filter to the pool query and snapshot", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const animeIds = Array.from({ length: 48 }, (_, index) => index + 1);
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockResolvedValue(animeIds);
    const metadataSpy = vi
      .spyOn(aniListLookupModule, "fetchAniListMediaMetadataBySearchBatch")
      .mockResolvedValue(new Map());
    const querySpy = vi.spyOn(pool, "query").mockResolvedValue({
      rows: makeAniListThemeRows(18),
    } as never);

    try {
      const store = new RoomStore({
        config: {
          maxRounds: 5,
          countdownMs: 5,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      });

      const created = store.createRoom();
      const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
      if ("status" in host) return;

      const difficultySet = store.setRoomDifficultyFilter(created.roomCode, host.playerId, "hard");
      expect(difficultySet).toMatchObject({ status: "ok", filter: "hard" });

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({
        ok: true,
        sourceMode: "anilist_union",
      });

      expect(perUserSpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      const sql = String(querySpy.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("aa.anilist_popularity is not null and aa.anilist_popularity < 30000");
      expect(store.roomState(created.roomCode)?.sourceConfig.difficultyFilter).toBe("hard");
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      metadataSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("backfills AniList popularity on demand before failing a difficulty-filtered start", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockResolvedValue([101, 102, 103]);
    const metadataSpy = vi.spyOn(aniListLookupModule, "fetchAniListMediaMetadataBySearchBatch");
    metadataSpy.mockImplementation(async (titles) =>
      new Map(
        titles.map((title) => [
          title,
          {
            englishTitle: `${title} EN`,
            popularity: 150_000,
            year: 2019,
            genres: ["Action"],
          },
        ]),
      ),
    );

    let filteredSelectCalls = 0;
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("from unnest($1::bigint[]) with ordinality")) {
        return {
          rows: [
            { anime_id: 101, title_romaji: "Anime 101" },
            { anime_id: 102, title_romaji: "Anime 102" },
          ],
        } as never;
      }
      if (text.includes("update anime_catalog_anime as a set") && text.includes("anilist_popularity")) {
        return { rows: [] } as never;
      }
      if (text.includes("from best_theme_video") && text.includes("aa.anilist_popularity >= 100000")) {
        filteredSelectCalls += 1;
        if (filteredSelectCalls === 1) {
          return { rows: [] } as never;
        }
        return {
          rows: [
            {
              anime_id: 101,
              video_key: "theme-101",
              webm_url: "https://v.animethemes.moe/theme-101.webm",
              theme_type: "OP",
              theme_number: 1,
              title_romaji: "Anime 101",
              title_english: "Anime 101 EN",
              song_title: "Song 101",
              song_artists: ["Artist 101"],
              aliases: ["Alias 101"],
            },
          ],
        } as never;
      }
      return { rows: [] } as never;
    });

    try {
      const store = new RoomStore({
        config: {
          maxRounds: 1,
          countdownMs: 5,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      });

      const created = store.createRoom();
      const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
      if ("status" in host) return;

      const difficultySet = store.setRoomDifficultyFilter(created.roomCode, host.playerId, "easy");
      expect(difficultySet).toMatchObject({ status: "ok", filter: "easy" });

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({ ok: true, sourceMode: "anilist_union" });
      expect(filteredSelectCalls).toBe(2);
      expect(metadataSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      metadataSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("keeps the selected AniList difficulty when metadata stays incomplete", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const animeIds = Array.from({ length: 16 }, (_, index) => 401 + index);
    const perUserSpy = vi.spyOn(userAnimeLibraryRepository, "animeIdsForUser").mockResolvedValue(animeIds);
    const metadataSpy = vi
      .spyOn(aniListLookupModule, "fetchAniListMediaMetadataBySearchBatch")
      .mockResolvedValue(
        new Map(animeIds.map((animeId) => [`Anime ${animeId}`, null])),
      );

    let filteredSelectCalls = 0;
    let unfilteredSelectCalls = 0;
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("from unnest($1::bigint[]) with ordinality")) {
        const limit = Number(params?.[1] ?? 0);
        const offset = Number(params?.[2] ?? 0);
        return {
          rows: animeIds.slice(offset, offset + limit).map((animeId) => ({
            anime_id: animeId,
            title_romaji: `Anime ${animeId}`,
          })),
        } as never;
      }
      if (text.includes("update anime_catalog_anime as a set") && text.includes("anilist_popularity")) {
        return { rows: [] } as never;
      }
      if (text.includes("from best_theme_video") && text.includes("aa.anilist_popularity >= 100000")) {
        filteredSelectCalls += 1;
        return { rows: [] } as never;
      }
      if (text.includes("from best_theme_video")) {
        unfilteredSelectCalls += 1;
      }
      return { rows: [] } as never;
    });

    try {
      const store = new RoomStore({
        config: {
          maxRounds: 1,
          countdownMs: 5,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      });

      const created = store.createRoom();
      const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
      if ("status" in host) return;

      const difficultySet = store.setRoomDifficultyFilter(created.roomCode, host.playerId, "easy");
      expect(difficultySet).toMatchObject({ status: "ok", filter: "easy" });

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({ ok: false, error: "NO_TRACKS_FOUND" });
      expect(filteredSelectCalls).toBeGreaterThanOrEqual(2);
      expect(unfilteredSelectCalls).toBe(0);
      expect(metadataSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      metadataSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("applies AniList decade and genre filters to the pool query and snapshot", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const animeIds = Array.from({ length: 48 }, (_, index) => index + 1);
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockResolvedValue(animeIds);
    const metadataSpy = vi
      .spyOn(aniListLookupModule, "fetchAniListMediaMetadataBySearchBatch")
      .mockResolvedValue(new Map());
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("select normalized_alias, anime_id, alias_type")) {
        return {
          rows: makeRandomAniListCandidates(4).map((candidate, index) => ({
            normalized_alias: `anime ${index + 1}`,
            anime_id: index + 1,
            alias_type: "canonical",
          })),
        } as never;
      }
      if (text.includes("update anime_catalog_anime as a set")) {
        return { rows: [] } as never;
      }
      return {
        rows: makeAniListThemeRows(12),
      } as never;
    });

    try {
      const store = new RoomStore({
        config: {
          maxRounds: 5,
          countdownMs: 5,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      });

      const created = store.createRoom();
      const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
      if ("status" in host) return;

      const filtersSet = store.setRoomContentFilters(created.roomCode, host.playerId, {
        decades: [2010],
        genres: ["Action"],
      });
      expect(filtersSet).toMatchObject({
        status: "ok",
        contentFilters: {
          decades: [2010],
          genres: ["Action"],
        },
      });

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({
        ok: true,
        sourceMode: "anilist_union",
      });

      const sql = String(querySpy.mock.calls[0]?.[0] ?? "");
      const params = (querySpy.mock.calls[0]?.[1] as unknown[]) ?? [];
      expect(sql).toContain("aa.year >= $3 and aa.year <= $4");
      expect(sql).toContain("aa.genres && $5::text[]");
      expect(params[2]).toBe(2010);
      expect(params[3]).toBe(2019);
      expect(params[4]).toEqual(["Action"]);
      expect(store.roomState(created.roomCode)?.sourceConfig.contentFilters).toEqual({
        decades: [2010],
        genres: ["Action"],
      });
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      metadataSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("backfills AniList year and genre metadata on demand before failing a filtered start", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockResolvedValue([101, 102, 103]);
    const metadataSpy = vi.spyOn(aniListLookupModule, "fetchAniListMediaMetadataBySearchBatch");
    metadataSpy.mockImplementation(async (titles) =>
      new Map(
        titles.map((title) => [
          title,
          {
            englishTitle: `${title} EN`,
            popularity: 150_000,
            year: 2011,
            genres: ["Action"],
          },
        ]),
      ),
    );

    let filteredSelectCalls = 0;
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("from unnest($1::bigint[]) with ordinality")) {
        return {
          rows: [
            { anime_id: 101, title_romaji: "Anime 101" },
            { anime_id: 102, title_romaji: "Anime 102" },
          ],
        } as never;
      }
      if (text.includes("update anime_catalog_anime as a set") && text.includes("year = coalesce")) {
        return { rows: [] } as never;
      }
      if (text.includes("from best_theme_video") && text.includes("aa.year >= $3 and aa.year <= $4")) {
        filteredSelectCalls += 1;
        if (filteredSelectCalls === 1) {
          return { rows: [] } as never;
        }
        return {
          rows: [
            {
              anime_id: 101,
              video_key: "theme-101",
              webm_url: "https://v.animethemes.moe/theme-101.webm",
              theme_type: "OP",
              theme_number: 1,
              title_romaji: "Anime 101",
              title_english: "Anime 101 EN",
              song_title: "Song 101",
              song_artists: ["Artist 101"],
              aliases: ["Alias 101"],
            },
          ],
        } as never;
      }
      return { rows: [] } as never;
    });

    try {
      const store = new RoomStore({
        config: {
          maxRounds: 1,
          countdownMs: 5,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      });

      const created = store.createRoom();
      const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
      if ("status" in host) return;

      const filtersSet = store.setRoomContentFilters(created.roomCode, host.playerId, {
        decades: [2010],
        genres: ["Action"],
      });
      expect(filtersSet).toMatchObject({
        status: "ok",
        contentFilters: {
          decades: [2010],
          genres: ["Action"],
        },
      });

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({ ok: true, sourceMode: "anilist_union" });
      expect(filteredSelectCalls).toBe(2);
      expect(metadataSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      metadataSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("eliminates players in lives mode, excludes spectators from later rounds, and ends early with one survivor", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 0,
        maxRounds: 3,
      },
    });
    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    const guestA = store.joinRoom(created.roomCode, "Guest A");
    const guestB = store.joinRoom(created.roomCode, "Guest B");
    expect(host.status).toBe("ok");
    expect(guestA.status).toBe("ok");
    expect(guestB.status).toBe("ok");
    if (host.status !== "ok" || guestA.status !== "ok" || guestB.status !== "ok") return;

    const livesSet = store.setRoomLivesMode(created.roomCode, host.value.playerId, {
      livesMode: true,
      maxLives: 1,
    });
    expect(livesSet).toMatchObject({
      status: "ok",
      livesMode: true,
      maxLives: 1,
    });

    store.setRoomSource(created.roomCode, host.value.playerId, "popular hits");
    store.setPlayerReady(created.roomCode, host.value.playerId, true);
    store.setPlayerReady(created.roomCode, guestA.value.playerId, true);
    store.setPlayerReady(created.roomCode, guestB.value.playerId, true);
    await store.startGame(created.roomCode, host.value.playerId);

    nowMs = 5;
    const roundOne = store.roomState(created.roomCode);
    expect(roundOne?.state).toBe("playing");
    const roundOneTrack = FIXTURE_TRACKS.find((track) => track.id === roundOne?.media?.trackId);
    expect(roundOneTrack).toBeDefined();
    const roundOneAnswer =
      roundOne?.mode === "mcq"
        ? `${roundOneTrack?.title} - ${roundOneTrack?.artist}`
        : roundOneTrack?.title ?? "";
    store.submitAnswer(created.roomCode, guestA.value.playerId, roundOneAnswer);
    store.submitAnswer(created.roomCode, guestB.value.playerId, roundOneAnswer);

    nowMs = 25;
    const revealAfterRoundOne = store.roomState(created.roomCode);
    expect(revealAfterRoundOne?.state).toBe("reveal");
    expect(revealAfterRoundOne?.players.find((player) => player.playerId === host.value.playerId)).toMatchObject({
      lives: 0,
      isEliminated: true,
    });

    nowMs = 30;
    const roundTwo = store.roomState(created.roomCode);
    expect(roundTwo?.state).toBe("playing");
    expect(roundTwo?.round).toBe(2);
    expect(roundTwo?.guessTotalCount).toBe(2);
    const roundTwoTrack = FIXTURE_TRACKS.find((track) => track.id === roundTwo?.media?.trackId);
    expect(roundTwoTrack).toBeDefined();
    const roundTwoAnswer =
      roundTwo?.mode === "mcq"
        ? `${roundTwoTrack?.title} - ${roundTwoTrack?.artist}`
        : roundTwoTrack?.title ?? "";
    expect(store.submitAnswer(created.roomCode, host.value.playerId, roundTwoAnswer)).toMatchObject({
      status: "ok",
      accepted: false,
    });

    store.submitAnswer(created.roomCode, guestA.value.playerId, roundTwoAnswer);

    nowMs = 50;
    const revealAfterRoundTwo = store.roomState(created.roomCode);
    expect(revealAfterRoundTwo?.state).toBe("reveal");
    expect(revealAfterRoundTwo?.totalRounds).toBe(2);
    expect(revealAfterRoundTwo?.players.find((player) => player.playerId === guestB.value.playerId)).toMatchObject({
      lives: 0,
      isEliminated: true,
    });

    nowMs = 55;
    const results = store.roomState(created.roomCode);
    expect(results?.state).toBe("results");
    expect(results?.totalRounds).toBe(2);
    expect(results?.leaderboard?.find((entry) => entry.playerId === guestA.value.playerId)).toMatchObject({
      lives: 1,
      isEliminated: false,
    });
  });

  it("does not collapse a solo lives-mode game while the player is still alive", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 0,
        maxRounds: 3,
      },
    });
    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const livesSet = store.setRoomLivesMode(created.roomCode, host.value.playerId, {
      livesMode: true,
      maxLives: 1,
    });
    expect(livesSet).toMatchObject({
      status: "ok",
      livesMode: true,
      maxLives: 1,
    });

    store.setRoomSource(created.roomCode, host.value.playerId, "popular hits");
    store.setPlayerReady(created.roomCode, host.value.playerId, true);
    await store.startGame(created.roomCode, host.value.playerId);

    nowMs = 5;
    const roundOne = store.roomState(created.roomCode);
    expect(roundOne?.state).toBe("playing");
    expect(roundOne?.totalRounds).toBe(3);

    const roundOneTrack = FIXTURE_TRACKS.find((track) => track.id === roundOne?.media?.trackId);
    expect(roundOneTrack).toBeDefined();
    const correctAnswer =
      roundOne?.mode === "mcq"
        ? `${roundOneTrack?.title} - ${roundOneTrack?.artist}`
        : roundOneTrack?.title ?? "";
    store.submitAnswer(created.roomCode, host.value.playerId, correctAnswer);

    const revealAfterRoundOne = store.roomState(created.roomCode);
    expect(revealAfterRoundOne?.state).toBe("reveal");
    expect(revealAfterRoundOne?.totalRounds).toBe(3);
    expect(revealAfterRoundOne?.players.find((player) => player.playerId === host.value.playerId)).toMatchObject({
      lives: 1,
      isEliminated: false,
    });

    nowMs = 10;
    const roundTwo = store.roomState(created.roomCode);
    expect(roundTwo?.state).toBe("playing");
    expect(roundTwo?.round).toBe(2);
    expect(roundTwo?.totalRounds).toBe(3);
  });

  it("ends a solo lives-mode game when the last player is eliminated", async () => {
    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async () => FIXTURE_TRACKS,
      config: {
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 0,
        maxRounds: 3,
      },
    });
    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const livesSet = store.setRoomLivesMode(created.roomCode, host.value.playerId, {
      livesMode: true,
      maxLives: 1,
    });
    expect(livesSet).toMatchObject({
      status: "ok",
      livesMode: true,
      maxLives: 1,
    });

    store.setRoomSource(created.roomCode, host.value.playerId, "popular hits");
    store.setPlayerReady(created.roomCode, host.value.playerId, true);
    await store.startGame(created.roomCode, host.value.playerId);

    nowMs = 5;
    const roundOne = store.roomState(created.roomCode);
    expect(roundOne?.state).toBe("playing");
    expect(roundOne?.totalRounds).toBe(3);

    const wrongAnswer = roundOne?.mode === "mcq" ? "wrong mcq answer" : "wrong text answer";
    store.submitAnswer(created.roomCode, host.value.playerId, wrongAnswer);

    const revealAfterRoundOne = store.roomState(created.roomCode);
    expect(revealAfterRoundOne?.state).toBe("reveal");
    expect(revealAfterRoundOne?.totalRounds).toBe(1);
    expect(revealAfterRoundOne?.players.find((player) => player.playerId === host.value.playerId)).toMatchObject({
      lives: 0,
      isEliminated: true,
    });

    nowMs = 10;
    const results = store.roomState(created.roomCode);
    expect(results?.state).toBe("results");
    expect(results?.totalRounds).toBe(1);
  });

  it("uses an unbiased AniList random draw without recent-history exclusions", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const animeIds = Array.from({ length: 741 }, (_, index) => index + 1);
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockResolvedValue(animeIds);
    const querySpy = vi.spyOn(pool, "query").mockResolvedValue({
      rows: makeAniListThemeRows(30),
    } as never);

    try {
      const store = new RoomStore({
        config: {
          maxRounds: 1,
          countdownMs: 5,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      });

      const created = store.createRoom();
      const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
      if ("status" in host) return;

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({
        ok: true,
        sourceMode: "anilist_union",
      });

      expect(perUserSpy).toHaveBeenCalledTimes(1);
      const requestedLimit = perUserSpy.mock.calls[0]?.[1] ?? 0;
      expect(requestedLimit).toBeGreaterThanOrEqual(2_000);
      expect(querySpy).toHaveBeenCalled();
      const queryParams = querySpy.mock.calls[0]?.[1] as unknown[] | undefined;
      expect(Array.isArray(queryParams)).toBe(true);
      expect(queryParams ?? []).toHaveLength(2);
      const state = store.roomState(created.roomCode);
      const roomMap = (store as unknown as {
        rooms: Map<string, { trackPool: MusicTrack[] }>;
      }).rooms;
      const session = roomMap.get(created.roomCode);
      expect(session?.trackPool.length ?? 0).toBeGreaterThan(0);
      expect(
        session?.trackPool.every(
          (track) =>
            track.provider !== "animethemes" ||
            (track.sourceUrl?.startsWith("https://api.example.test/quiz/media/animethemes/") ?? false),
        ) ?? false,
      ).toBe(true);
      expect(state?.answerSuggestions.includes("Anime EN 1")).toBe(true);
      expect(state?.answerSuggestions.includes("Alias 1")).toBe(true);
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("starts random_classic without requiring linked AniList players", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const getRandomAniListAnimeCandidates = vi.fn().mockResolvedValue(makeRandomAniListCandidates(4));
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockRejectedValue(new Error("random_classic should not call animeIdsForUser"));
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("select normalized_alias, anime_id, alias_type")) {
        return {
          rows: makeRandomAniListCandidates(4).map((candidate, index) => ({
            normalized_alias: `anime ${index + 1}`,
            anime_id: index + 1,
            alias_type: "canonical",
          })),
        } as never;
      }
      if (text.includes("update anime_catalog_anime as a set")) {
        return { rows: [] } as never;
      }
      return {
        rows: makeAniListThemeRows(12),
      } as never;
    });

    try {
      const store = new RoomStore({ getRandomAniListAnimeCandidates } as never);
      const created = store.createRoom();
      const host = store.joinRoom(created.roomCode, "Host");
      expect(host.status).toBe("ok");
      if (host.status !== "ok") return;

      const modeSet = store.setRoomSourceMode(created.roomCode, host.value.playerId, "random_classic" as never);
      expect(modeSet).toMatchObject({ status: "ok", mode: "random_classic" });

      const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
      expect(ready.status).toBe("ok");

      const started = await store.startGame(created.roomCode, host.value.playerId);
      expect(started).toMatchObject({ ok: true, sourceMode: "random_classic" });
      expect(querySpy).toHaveBeenCalled();
      expect(getRandomAniListAnimeCandidates).toHaveBeenCalledTimes(1);
      expect(perUserSpy).not.toHaveBeenCalled();
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("maps random_classic AniList discovery titles onto local catalog ids instead of using raw AniList media ids", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const getRandomAniListAnimeCandidates = vi.fn().mockResolvedValue([
      {
        mediaId: 90_001,
        titleRomaji: "Anime 41",
        titleEnglish: "Anime EN 41",
        titleNative: null,
        synonyms: ["Alias 41"],
        popularity: 4_100,
        year: 2011,
        genres: ["Action"],
      },
      {
        mediaId: 90_002,
        titleRomaji: "Anime 42",
        titleEnglish: "Anime EN 42",
        titleNative: null,
        synonyms: ["Alias 42"],
        popularity: 4_200,
        year: 2012,
        genres: ["Adventure"],
      },
      {
        mediaId: 90_003,
        titleRomaji: "Anime 43",
        titleEnglish: "Anime EN 43",
        titleNative: null,
        synonyms: ["Alias 43"],
        popularity: 4_300,
        year: 2013,
        genres: ["Comedy"],
      },
      {
        mediaId: 90_004,
        titleRomaji: "Anime 44",
        titleEnglish: "Anime EN 44",
        titleNative: null,
        synonyms: ["Alias 44"],
        popularity: 4_400,
        year: 2014,
        genres: ["Drama"],
      },
    ] satisfies AniListRandomAnimeCandidate[]);
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockRejectedValue(new Error("random_classic should not call animeIdsForUser"));
    let selectedAnimeIds: unknown[] | null = null;
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("select normalized_alias, anime_id, alias_type")) {
        return {
          rows: [
            { normalized_alias: "anime 41", anime_id: 41, alias_type: "canonical" },
            { normalized_alias: "anime 42", anime_id: 42, alias_type: "canonical" },
            { normalized_alias: "anime 43", anime_id: 43, alias_type: "canonical" },
            { normalized_alias: "anime 44", anime_id: 44, alias_type: "canonical" },
          ],
        } as never;
      }
      if (text.includes("update anime_catalog_anime as a set")) {
        return { rows: [] } as never;
      }
      if (text.includes("from best_theme_video")) {
        selectedAnimeIds = (params?.[0] as unknown[]) ?? null;
        return {
          rows: makeAniListThemeRows(4, 40),
        } as never;
      }
      return { rows: [] } as never;
    });

    try {
      const store = new RoomStore({
        getRandomAniListAnimeCandidates,
        config: {
          maxRounds: 4,
        },
      } as never);
      const created = store.createRoom();
      const host = store.joinRoom(created.roomCode, "Host");
      expect(host.status).toBe("ok");
      if (host.status !== "ok") return;

      const modeSet = store.setRoomSourceMode(created.roomCode, host.value.playerId, "random_classic" as never);
      expect(modeSet).toMatchObject({ status: "ok", mode: "random_classic" });

      const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
      expect(ready.status).toBe("ok");

      const started = await store.startGame(created.roomCode, host.value.playerId);
      expect(started).toMatchObject({ ok: true, sourceMode: "random_classic" });
      expect(selectedAnimeIds).toEqual([41, 42, 43, 44]);
      expect(perUserSpy).not.toHaveBeenCalled();
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("returns ANILIST_REMOTE_FAILURE when random_classic AniList discovery is fully unavailable", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const getRandomAniListAnimeCandidates = vi.fn().mockRejectedValue(new AniListRemoteFailureError(3));
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockRejectedValue(new Error("random_classic should not call animeIdsForUser"));
    const querySpy = vi.spyOn(pool, "query");

    try {
      const store = new RoomStore({ getRandomAniListAnimeCandidates } as never);
      const created = store.createRoom();
      const host = store.joinRoom(created.roomCode, "Host");
      expect(host.status).toBe("ok");
      if (host.status !== "ok") return;

      const modeSet = store.setRoomSourceMode(created.roomCode, host.value.playerId, "random_classic" as never);
      expect(modeSet).toMatchObject({ status: "ok", mode: "random_classic" });

      const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
      expect(ready.status).toBe("ok");

      const started = await store.startGame(created.roomCode, host.value.playerId);
      expect(started).toMatchObject({ ok: false, error: "ANILIST_REMOTE_FAILURE" });
      expect(getRandomAniListAnimeCandidates).toHaveBeenCalledTimes(1);
      expect(perUserSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("broadens random_classic AniList discovery when the first fresh draw has no playable AnimeThemes matches", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const getRandomAniListAnimeCandidates = vi
      .fn()
      .mockResolvedValueOnce(makeRandomAniListCandidates(120))
      .mockResolvedValueOnce(makeRandomAniListCandidates(120, { animeOffset: 2_000 }));
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockRejectedValue(new Error("random_classic should not call animeIdsForUser"));
    let selectCalls = 0;
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("select normalized_alias, anime_id, alias_type")) {
        return {
          rows: [
            ...makeRandomAniListCandidates(120).map((candidate, index) => ({
              normalized_alias: candidate.titleRomaji ? candidate.titleRomaji.toLowerCase() : "",
              anime_id: index + 1,
              alias_type: "canonical",
            })),
            ...makeRandomAniListCandidates(120, { animeOffset: 2_000 }).map((candidate, index) => ({
              normalized_alias: candidate.titleRomaji ? candidate.titleRomaji.toLowerCase() : "",
              anime_id: index + 2_001,
              alias_type: "canonical",
            })),
          ],
        } as never;
      }
      if (!text.includes("from best_theme_video")) {
        return { rows: [] } as never;
      }
      selectCalls += 1;
      if (selectCalls === 1) {
        return { rows: [] } as never;
      }
      return {
        rows: makeAniListThemeRows(16),
      } as never;
    });

    try {
      const store = new RoomStore({ getRandomAniListAnimeCandidates } as never);
      const created = store.createRoom();
      const host = store.joinRoom(created.roomCode, "Host");
      expect(host.status).toBe("ok");
      if (host.status !== "ok") return;

      const modeSet = store.setRoomSourceMode(created.roomCode, host.value.playerId, "random_classic" as never);
      expect(modeSet).toMatchObject({ status: "ok", mode: "random_classic" });

      const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
      expect(ready.status).toBe("ok");

      const started = await store.startGame(created.roomCode, host.value.playerId);
      expect(started).toMatchObject({ ok: true, sourceMode: "random_classic" });
      expect(getRandomAniListAnimeCandidates).toHaveBeenCalledTimes(2);
      expect(selectCalls).toBe(2);
      expect(perUserSpy).not.toHaveBeenCalled();
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("replayRoom preserves random_classic source mode and categoryQuery", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const getRandomAniListAnimeCandidates = vi.fn().mockResolvedValue(makeRandomAniListCandidates(4));
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockRejectedValue(new Error("random_classic should not call animeIdsForUser"));
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("select normalized_alias, anime_id, alias_type")) {
        return {
          rows: makeRandomAniListCandidates(4).map((candidate, index) => ({
            normalized_alias: `anime ${index + 1}`,
            anime_id: index + 1,
            alias_type: "canonical",
          })),
        } as never;
      }
      if (text.includes("update anime_catalog_anime as a set")) {
        return { rows: [] } as never;
      }
      return {
        rows: makeAniListThemeRows(12),
      } as never;
    });

    let nowMs = 0;
    try {
      const store = new RoomStore({
        getRandomAniListAnimeCandidates,
        now: () => nowMs,
        config: {
          maxRounds: 1,
          countdownMs: 5,
          loadingMs: 0,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      } as never);
      const created = store.createRoom();
      const host = store.joinRoom(created.roomCode, "Host");
      expect(host.status).toBe("ok");
      if (host.status !== "ok") return;

      store.setRoomSourceMode(created.roomCode, host.value.playerId, "random_classic" as never);
      store.setPlayerReady(created.roomCode, host.value.playerId, true);
      const started = await store.startGame(created.roomCode, host.value.playerId);
      expect(started).toMatchObject({ ok: true, sourceMode: "random_classic" });

      // Advance through countdown → playing → reveal → leaderboard → results
      for (let step = 0; step < 20; step += 1) {
        nowMs += 10;
        const snapshot = store.roomState(created.roomCode);
        if (snapshot?.state === "results") break;
      }
      expect(store.roomState(created.roomCode)?.state).toBe("results");

      const replay = store.replayRoom(created.roomCode, host.value.playerId);
      expect(replay.status).toBe("ok");
      if (replay.status !== "ok") return;

      expect(replay.categoryQuery).toBe("anilist:random:classic");

      const lobby = store.roomState(created.roomCode);
      expect(lobby?.state).toBe("waiting");
      expect(lobby?.sourceMode).toBe("random_classic");
      expect(lobby?.categoryQuery).toBe("anilist:random:classic");
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("setRoomSourceMode clears trackPool consistently across all mode transitions", () => {
    const store = new RoomStore({});

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    // random_classic → anilist_union: trackPool must be cleared
    store.setRoomSourceMode(created.roomCode, host.value.playerId, "random_classic" as never);
    expect(store.roomState(created.roomCode)).toMatchObject({
      sourceMode: "random_classic",
      categoryQuery: "anilist:random:classic",
      poolSize: 0,
    });

    store.setRoomSourceMode(created.roomCode, host.value.playerId, "anilist_union" as never);
    expect(store.roomState(created.roomCode)).toMatchObject({
      sourceMode: "anilist_union",
      categoryQuery: "anilist:linked:union",
      poolSize: 0,
    });

    // anilist_union → players_liked: trackPool must be cleared
    store.setRoomSourceMode(created.roomCode, host.value.playerId, "players_liked" as never);
    expect(store.roomState(created.roomCode)).toMatchObject({
      sourceMode: "players_liked",
      categoryQuery: "players:liked",
      poolSize: 0,
    });

    // players_liked → public_playlist: trackPool must be cleared
    store.setRoomSourceMode(created.roomCode, host.value.playerId, "public_playlist" as never);
    expect(store.roomState(created.roomCode)).toMatchObject({
      sourceMode: "public_playlist",
      poolSize: 0,
    });
  });

  it("uses a larger AniList candidate draw to reduce repeated easy-mode openings and qcm choices", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = "postgres://test";
    process.env.BETTER_AUTH_URL = "https://api.example.test";
    const animeIds = Array.from({ length: 2_000 }, (_, index) => index + 1);
    const perUserSpy = vi
      .spyOn(userAnimeLibraryRepository, "animeIdsForUser")
      .mockResolvedValue(animeIds);
    const querySpy = vi.spyOn(pool, "query").mockResolvedValue({
      rows: makeAniListThemeRows(120),
    } as never);

    try {
      const store = new RoomStore({
        config: {
          maxRounds: 15,
          countdownMs: 5,
          playingMs: 20,
          revealMs: 5,
          leaderboardMs: 5,
        },
      });

      const created = store.createRoom();
      const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
      if ("status" in host) return;

      const difficultySet = store.setRoomDifficultyFilter(created.roomCode, host.playerId, "easy");
      expect(difficultySet).toMatchObject({ status: "ok", filter: "easy" });

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({ ok: true, sourceMode: "anilist_union" });

      expect(querySpy).toHaveBeenCalledTimes(1);
      const queryParams = querySpy.mock.calls[0]?.[1] as unknown[] | undefined;
      expect(Array.isArray(queryParams)).toBe(true);
      expect(Number(queryParams?.[1] ?? 0)).toBeGreaterThanOrEqual(240);
      const roomMap = (store as unknown as {
        rooms: Map<string, { trackPool: MusicTrack[]; distractorTrackPool: MusicTrack[] }>;
      }).rooms;
      const session = roomMap.get(created.roomCode);
      expect(session?.trackPool.length).toBe(15);
      expect((session?.distractorTrackPool.length ?? 0)).toBeGreaterThanOrEqual(80);
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
      }
      perUserSpy.mockRestore();
      querySpy.mockRestore();
    }
  });

  it("starts only when the full requested round pool is prepared", async () => {
    let nowMs = 0;
    const requestedSizes: number[] = [];
    const makeTrack = (index: number): MusicTrack => ({
      provider: "youtube",
      id: `yt-${index}`,
      title: `Track ${index}`,
      artist: `Artist ${index}`,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=yt-${index}`,
    });
    const store = new RoomStore({
      now: () => nowMs,
      getTrackPool: async (_query, size) => {
        requestedSizes.push(size);
        return Array.from({ length: size }, (_, index) => makeTrack(index + 1));
      },
      config: {
        maxRounds: 10,
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, host.value.playerId, "deezer:playlist:3155776842");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    expect(ready.status).toBe("ok");
    const started = await store.startGame(created.roomCode, host.value.playerId);
    expect(started).toMatchObject({ ok: true });
    expect((started && "poolSize" in started ? started.poolSize : 0)).toBe(10);
    expect((started && "totalRounds" in started ? started.totalRounds : 0)).toBe(10);
    expect(requestedSizes[0]).toBeGreaterThanOrEqual(10);

    nowMs = 5;
    const playing = store.roomState(created.roomCode);
    expect(playing?.state).toBe("playing");
    expect(playing?.mode).toBe("mcq");
    expect(playing?.choices).toHaveLength(4);
    expect((playing?.choices ?? []).some((choice) => choice.value.startsWith("Choix alternatif"))).toBe(false);
  });

  it("refuses to start when fetched track pool is below configured max rounds", async () => {
    const store = new RoomStore({
      getTrackPool: async () => [
        {
          provider: "youtube",
          id: "few-1",
          title: "Few One",
          artist: "Tiny Pool",
          previewUrl: null,
          sourceUrl: "https://www.youtube.com/watch?v=few-1",
        },
        {
          provider: "youtube",
          id: "few-2",
          title: "Few Two",
          artist: "Tiny Pool",
          previewUrl: null,
          sourceUrl: "https://www.youtube.com/watch?v=few-2",
        },
        {
          provider: "youtube",
          id: "few-3",
          title: "Few Three",
          artist: "Tiny Pool",
          previewUrl: null,
          sourceUrl: "https://www.youtube.com/watch?v=few-3",
        },
      ],
      config: {
        maxRounds: 10,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, host.value.playerId, "few tracks");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    expect(ready.status).toBe("ok");

    const started = await store.startGame(created.roomCode, host.value.playerId);
    expect(started).toMatchObject({
      ok: false,
      error: "NO_TRACKS_FOUND",
    });
  });

  it("keeps deezer playlist start in resolving state when playable pool is still incomplete", async () => {
    const fewTracks: MusicTrack[] = Array.from({ length: 3 }, (_, index) => ({
      provider: "youtube",
      id: `deezer-incomplete-${index + 1}`,
      title: `Deezer Incomplete ${index + 1}`,
      artist: `Artist ${index + 1}`,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=deezer-incomplete-${index + 1}`,
    }));

    const store = new RoomStore({
      getTrackPool: async () => fewTracks,
      config: {
        maxRounds: 10,
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(
      created.roomCode,
      host.value.playerId,
      "deezer:playlist:3155776842",
    );
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    expect(ready.status).toBe("ok");

    const started = await store.startGame(created.roomCode, host.value.playerId);
    expect(started).toMatchObject({
      ok: false,
      error: "PLAYLIST_TRACKS_RESOLVING",
    });
  });

  it("supports players_liked mode with linked provider contributions", async () => {
    const likedTracks: MusicTrack[] = Array.from({ length: 12 }, (_, index) => ({
      provider: "youtube",
      id: `liked-${index + 1}`,
      title: `Liked Track ${index + 1}`,
      artist: `Artist ${index + 1}`,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=liked-${index + 1}`,
    }));
    const store = new RoomStore({
      getPlayerLikedTracks: async () => likedTracks,
      config: {
        maxRounds: 10,
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoomAsUser(
      created.roomCode,
      "Host",
      "user-host",
      { spotify: { status: "linked", estimatedTrackCount: 120 } },
    );
    const guest = store.joinRoom(created.roomCode, "Guest");
    if ("status" in host) return;
    if (guest.status !== "ok") return;

    const modeSet = store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    expect(modeSet.status).toBe("ok");
    const contribution = store.setPlayerLibraryContribution(
      created.roomCode,
      host.playerId,
      "spotify",
      true,
    );
    expect(contribution.status).toBe("ok");
    store.setPlayerReady(created.roomCode, host.playerId, true);
    store.setPlayerReady(created.roomCode, guest.value.playerId, true);

    const started = await store.startGame(created.roomCode, host.playerId);
    expect(started).toMatchObject({
      ok: true,
      sourceMode: "players_liked",
    });
  });

  it("keeps players_liked round answers youtube-playable when reusing mixed pools", async () => {
    const playableTracks: MusicTrack[] = Array.from({ length: 10 }, (_, index) => ({
      provider: "youtube",
      id: `playable-${index + 1}`,
      title: `Playable ${index + 1}`,
      artist: `Playable Artist ${index + 1}`,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=playable-${index + 1}`,
    }));
    const nonPlayableTracks: MusicTrack[] = Array.from({ length: 120 }, (_, index) => ({
      provider: "deezer",
      id: `non-playable-${index + 1}`,
      title: `Non Playable ${index + 1}`,
      artist: `Non Playable Artist ${index + 1}`,
      previewUrl: null,
      sourceUrl: `https://www.deezer.com/track/non-playable-${index + 1}`,
    }));
    const mixedTracks = [...playableTracks, ...nonPlayableTracks];

    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getPlayerLikedTracks: async () => mixedTracks,
      config: {
        maxRounds: 10,
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
      },
    });

    for (let iteration = 0; iteration < 5; iteration += 1) {
      const created = store.createRoom();
      const host = store.joinRoomAsUser(
        created.roomCode,
        `Host ${iteration + 1}`,
        `user-host-${iteration + 1}`,
        { spotify: { status: "linked", estimatedTrackCount: 120 } },
      );
      if ("status" in host) return;

      const modeSet = store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
      expect(modeSet.status).toBe("ok");
      const contribution = store.setPlayerLibraryContribution(
        created.roomCode,
        host.playerId,
        "spotify",
        true,
      );
      expect(contribution.status).toBe("ok");
      const ready = store.setPlayerReady(created.roomCode, host.playerId, true);
      expect(ready.status).toBe("ok");

      const started = await store.startGame(created.roomCode, host.playerId);
      expect(started).toMatchObject({
        ok: true,
        sourceMode: "players_liked",
      });

      nowMs += 6;
      const snapshot = store.roomState(created.roomCode);
      expect(snapshot?.state).toBe("playing");
      expect(snapshot?.media?.provider).toBe("youtube");
      expect(snapshot?.media?.embedUrl).toContain("youtube.com/embed/");
    }
  });

  it("returns PLAYERS_LIBRARY_SYNCING when players_liked loading times out", async () => {
    const store = new RoomStore({
      getPlayerLikedTracks: async () => {
        throw new Error("PLAYERS_LIBRARY_TIMEOUT");
      },
      config: {
        maxRounds: 10,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoomAsUser(
      created.roomCode,
      "Host",
      "user-host",
      { spotify: { status: "linked", estimatedTrackCount: 120 } },
    );
    if ("status" in host) return;

    const modeSet = store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    expect(modeSet.status).toBe("ok");
    const contribution = store.setPlayerLibraryContribution(
      created.roomCode,
      host.playerId,
      "spotify",
      true,
    );
    expect(contribution.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.playerId, true);
    expect(ready.status).toBe("ok");

    const started = await store.startGame(created.roomCode, host.playerId);
    expect(started).toMatchObject({
      ok: false,
      error: "PLAYERS_LIBRARY_SYNCING",
    });
  });

  it("keeps canStart true in players_liked waiting state when a linked contributor exists", async () => {
    const store = new RoomStore({
      getPlayerLikedTracks: async () => [],
      config: {
        maxRounds: 10,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoomAsUser(
      created.roomCode,
      "Host",
      "user-host",
      { spotify: { status: "linked", estimatedTrackCount: 120 } },
    );
    if ("status" in host) return;

    const modeSet = store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    expect(modeSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.playerId, true);
    expect(ready.status).toBe("ok");

    let snapshot = store.roomState(created.roomCode);
    for (let attempt = 0; attempt < 30 && snapshot?.isResolvingTracks; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      snapshot = store.roomState(created.roomCode);
    }

    expect(snapshot?.isResolvingTracks).toBe(false);
    expect(snapshot?.poolBuild.status).toBe("idle");
    expect(snapshot?.canStart).toBe(true);
  });

  it("keeps canStart true in players_liked waiting state when synced tracks exist without active link", async () => {
    const store = new RoomStore({
      getPlayerLikedTracks: async () => [],
      config: {
        maxRounds: 10,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoomAsUser(
      created.roomCode,
      "Host",
      "user-host",
      { spotify: { status: "not_linked", estimatedTrackCount: 42 } },
    );
    if ("status" in host) return;

    const modeSet = store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    expect(modeSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.playerId, true);
    expect(ready.status).toBe("ok");

    let snapshot = store.roomState(created.roomCode);
    for (let attempt = 0; attempt < 30 && snapshot?.isResolvingTracks; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      snapshot = store.roomState(created.roomCode);
    }

    expect(snapshot?.isResolvingTracks).toBe(false);
    expect(snapshot?.canStart).toBe(true);
  });

  it("starts players_liked mode when synced tracks exist without active link", async () => {
    const likedTracks: MusicTrack[] = Array.from({ length: 12 }, (_, index) => ({
      provider: "youtube",
      id: `cached-liked-${index + 1}`,
      title: `Cached Liked ${index + 1}`,
      artist: `Cached Artist ${index + 1}`,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=cached-liked-${index + 1}`,
    }));
    const store = new RoomStore({
      getPlayerLikedTracks: async () => likedTracks,
      config: {
        maxRounds: 10,
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoomAsUser(
      created.roomCode,
      "Host",
      "user-host",
      { spotify: { status: "expired", estimatedTrackCount: 120 } },
    );
    if ("status" in host) return;

    const modeSet = store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    expect(modeSet.status).toBe("ok");
    store.setPlayerReady(created.roomCode, host.playerId, true);

    const started = await store.startGame(created.roomCode, host.playerId);
    expect(started).toMatchObject({
      ok: true,
      sourceMode: "players_liked",
    });
  });

  it("replay keeps linked providers enabled for players_liked mode", async () => {
    const likedTracks: MusicTrack[] = Array.from({ length: 12 }, (_, index) => ({
      provider: "youtube",
      id: `replay-liked-${index + 1}`,
      title: `Replay Liked ${index + 1}`,
      artist: `Replay Artist ${index + 1}`,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=replay-liked-${index + 1}`,
    }));

    let nowMs = 0;
    const store = new RoomStore({
      now: () => nowMs,
      getPlayerLikedTracks: async () => likedTracks,
      config: {
        maxRounds: 2,
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoomAsUser(
      created.roomCode,
      "Host",
      "user-host",
      { spotify: { status: "linked", estimatedTrackCount: 120 } },
    );
    if ("status" in host) return;

    store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    store.setPlayerReady(created.roomCode, host.playerId, true);
    const started = await store.startGame(created.roomCode, host.playerId);
    expect(started).toMatchObject({ ok: true });

    for (let step = 0; step < 20; step += 1) {
      nowMs += 30;
      const snapshot = store.roomState(created.roomCode);
      if (snapshot?.state === "results") break;
    }

    const replay = store.replayRoom(created.roomCode, host.playerId);
    expect(replay.status).toBe("ok");

    const lobby = store.roomState(created.roomCode);
    expect(lobby?.players[0]?.libraryContribution.includeInPool.spotify).toBe(true);
  });

  it("exposes resolving state only during start and updates merged/playable counts after players_liked sync", async () => {
    const likedTracks: MusicTrack[] = Array.from({ length: 12 }, (_, index) => ({
      provider: "youtube",
      id: `sync-${index + 1}`,
      title: `Sync Track ${index + 1}`,
      artist: `Sync Artist ${index + 1}`,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=sync-${index + 1}`,
    }));
    const pendingLikedFetch = deferred<MusicTrack[]>();
    const store = new RoomStore({
      getPlayerLikedTracks: async () => await pendingLikedFetch.promise,
      config: {
        maxRounds: 10,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoomAsUser(
      created.roomCode,
      "Host",
      "user-host",
      { spotify: { status: "linked", estimatedTrackCount: 120 } },
    );
    if ("status" in host) return;

    const modeSet = store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    expect(modeSet.status).toBe("ok");
    const contribution = store.setPlayerLibraryContribution(
      created.roomCode,
      host.playerId,
      "spotify",
      true,
    );
    expect(contribution.status).toBe("ok");

    const startPromise = store.startGame(created.roomCode, host.playerId);
    const syncingSnapshot = store.roomState(created.roomCode);
    expect(syncingSnapshot?.isResolvingTracks).toBe(true);
    expect(syncingSnapshot?.poolBuild.status).toBe("building");
    expect(syncingSnapshot?.poolBuild.mergedTracksCount).toBe(0);
    expect(syncingSnapshot?.poolBuild.playableTracksCount).toBe(0);

    pendingLikedFetch.resolve(likedTracks);
    const started = await startPromise;
    expect(started).toMatchObject({ ok: true });

    let resolvedSnapshot = store.roomState(created.roomCode);
    for (let attempt = 0; attempt < 30 && resolvedSnapshot?.isResolvingTracks; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      resolvedSnapshot = store.roomState(created.roomCode);
    }

    expect(resolvedSnapshot?.isResolvingTracks).toBe(false);
    expect(resolvedSnapshot?.poolBuild.status).toBe("ready");
    expect(resolvedSnapshot?.poolBuild.mergedTracksCount).toBe(12);
    expect(resolvedSnapshot?.poolBuild.playableTracksCount).toBe(12);
  });

  it("blocks players_liked mode start when no eligible contributor is opted-in", async () => {
    const store = new RoomStore({
      getPlayerLikedTracks: async () => [],
      config: {
        maxRounds: 5,
      },
    });
    const created = store.createRoom();
    const host = store.joinRoomAsUser(created.roomCode, "Host", "user-host");
    if ("status" in host) return;
    store.setRoomSourceMode(created.roomCode, host.playerId, "players_liked");
    store.setPlayerReady(created.roomCode, host.playerId, true);

    const started = await store.startGame(created.roomCode, host.playerId);
    expect(started).toMatchObject({
      ok: false,
      error: "PLAYERS_LIBRARY_NOT_READY",
    });
  });

  it("returns SPOTIFY_RATE_LIMITED when upstream spotify is throttled", async () => {
    const store = new RoomStore({
      getTrackPool: async () => {
        throw new Error("SPOTIFY_RATE_LIMITED");
      },
      config: {
        maxRounds: 10,
        countdownMs: 5,
        playingMs: 20,
        revealMs: 5,
        leaderboardMs: 5,
      },
    });

    const created = store.createRoom();
    const host = store.joinRoom(created.roomCode, "Host");
    expect(host.status).toBe("ok");
    if (host.status !== "ok") return;

    const sourceSet = store.setRoomSource(created.roomCode, host.value.playerId, "spotify:playlist:abc123");
    expect(sourceSet.status).toBe("ok");
    const ready = store.setPlayerReady(created.roomCode, host.value.playerId, true);
    expect(ready.status).toBe("ok");

    const started = await store.startGame(created.roomCode, host.value.playerId);
    expect(started).toMatchObject({
      ok: false,
      error: "SPOTIFY_RATE_LIMITED",
    });
  });
});
