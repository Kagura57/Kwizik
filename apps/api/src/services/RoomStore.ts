import { isTextAnswerCorrect } from "./FuzzyMatcher";
import { logEvent } from "../lib/logger";
import { providerMetricsSnapshot } from "../lib/provider-metrics";
import { applyScore } from "./ScoreCalculator";
import { hasAudioPreview, hasYouTubePlayback, isTrackPlayable } from "./PlaybackSupport";
import type { ClosedRound, GameState } from "./RoomManager";
import { RoomManager } from "./RoomManager";
import { trackCache } from "./TrackCache";
import type { MusicTrack } from "./music-types";
import { SPOTIFY_RATE_LIMITED_ERROR, spotifyPlaylistRateLimitRetryAfterMs } from "../routes/music/spotify";

type RoundMode = "mcq" | "text";

type Player = {
  id: string;
  userId: string | null;
  displayName: string;
  joinedAtMs: number;
  isReady: boolean;
  score: number;
  streak: number;
  maxStreak: number;
  totalResponseMs: number;
  correctAnswers: number;
};

type RoomSession = {
  roomCode: string;
  createdAtMs: number;
  isPublic: boolean;
  manager: RoomManager;
  players: Map<string, Player>;
  hostPlayerId: string | null;
  nextPlayerNumber: number;
  trackPool: MusicTrack[];
  categoryQuery: string;
  totalRounds: number;
  roundModes: RoundMode[];
  roundChoices: Map<number, string[]>;
  latestReveal: {
    round: number;
    trackId: string;
    title: string;
    artist: string;
    provider: MusicTrack["provider"];
    mode: RoundMode;
    acceptedAnswer: string;
    previewUrl: string | null;
    sourceUrl: string | null;
    embedUrl: string | null;
    choices: string[] | null;
  } | null;
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_ROUND_CONFIG = {
  countdownMs: 3_000,
  playingMs: 12_000,
  revealMs: 4_000,
  leaderboardMs: 3_000,
  baseScore: 1_000,
  maxRounds: 10,
} as const;

type RoundConfig = typeof DEFAULT_ROUND_CONFIG;

type RoomStoreDependencies = {
  now?: () => number;
  getTrackPool?: (categoryQuery: string, size: number) => Promise<MusicTrack[]>;
  config?: Partial<RoundConfig>;
};

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

function normalizeAnswer(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function averageResponseMs(player: Player) {
  if (player.correctAnswers <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return player.totalResponseMs / player.correctAnswers;
}

function modeForRound(round: number): RoundMode {
  return round % 2 === 1 ? "mcq" : "text";
}

function asChoiceLabel(track: MusicTrack) {
  return `${track.title} - ${track.artist}`;
}

const TRACK_PROMOTION_PATTERNS = [
  /\b(this\s+app|download\s+app|free\s+music\s+alternative|best\s+free\s+music)\b/i,
  /\bspotify\b.*\b(app|alternative|free)\b/i,
  /\bdeezer\s*-\s*deezer\b/i,
  /\bdeezer\s*session\b/i,
  /\bheartify\b/i,
];

function looksLikePromotionalTrack(track: Pick<MusicTrack, "title" | "artist">) {
  const text = `${track.title} ${track.artist}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return TRACK_PROMOTION_PATTERNS.some((pattern) => pattern.test(text));
}

function embedUrlForTrack(track: Pick<MusicTrack, "provider" | "id">) {
  if (track.provider === "spotify") {
    return `https://open.spotify.com/embed/track/${track.id}?utm_source=tunaris`;
  }
  if (track.provider === "youtube") {
    return `https://www.youtube.com/embed/${track.id}?autoplay=1&controls=0&disablekb=1&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&fs=0&enablejsapi=1`;
  }
  if (track.provider === "deezer") {
    return `https://widget.deezer.com/widget/dark/track/${track.id}`;
  }
  return null;
}

function randomShuffle<T>(values: T[]) {
  const copied = [...values];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copied[index];
    copied[index] = copied[swapIndex] as T;
    copied[swapIndex] = current as T;
  }
  return copied;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutErrorCode: string,
) {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutErrorCode));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function trackSignature(track: Pick<MusicTrack, "provider" | "id" | "title" | "artist">) {
  return `${track.provider}:${track.id}:${track.title.toLowerCase()}:${track.artist.toLowerCase()}`;
}

export class RoomStore {
  private readonly rooms = new Map<string, RoomSession>();
  private readonly roomPreloadJobs = new Map<string, Promise<void>>();
  private readonly now: () => number;
  private readonly getTrackPool: (categoryQuery: string, size: number) => Promise<MusicTrack[]>;
  private readonly config: RoundConfig;

  constructor(dependencies: RoomStoreDependencies = {}) {
    this.now = dependencies.now ?? (() => Date.now());
    this.getTrackPool = dependencies.getTrackPool ?? ((categoryQuery, size) =>
      trackCache.getOrBuild(categoryQuery, size));
    this.config = {
      ...DEFAULT_ROUND_CONFIG,
      ...(dependencies.config ?? {}),
    };
  }

  private sortedPlayers(session: RoomSession) {
    return [...session.players.values()].sort((left, right) => left.joinedAtMs - right.joinedAtMs);
  }

  private ensureHost(session: RoomSession) {
    if (session.hostPlayerId && session.players.has(session.hostPlayerId)) {
      return session.hostPlayerId;
    }
    const nextHost = this.sortedPlayers(session)[0]?.id ?? null;
    session.hostPlayerId = nextHost;
    return nextHost;
  }

  private resetReadyStates(session: RoomSession) {
    for (const player of session.players.values()) {
      player.isReady = false;
    }
  }

  private ranking(session: RoomSession) {
    return [...session.players.values()]
      .sort((a, b) => {
        const byScore = b.score - a.score;
        if (byScore !== 0) return byScore;

        const byStreak = b.maxStreak - a.maxStreak;
        if (byStreak !== 0) return byStreak;

        const avgA = averageResponseMs(a);
        const avgB = averageResponseMs(b);
        const avgAIsFinite = Number.isFinite(avgA);
        const avgBIsFinite = Number.isFinite(avgB);

        if (avgAIsFinite && avgBIsFinite) {
          return avgA - avgB;
        }

        if (avgAIsFinite) return -1;
        if (avgBIsFinite) return 1;
        return 0;
      })
      .map((player, index) => ({
        rank: index + 1,
        playerId: player.id,
        userId: player.userId,
        displayName: player.displayName,
        score: player.score,
        maxStreak: player.maxStreak,
        averageResponseMs: Number.isFinite(averageResponseMs(player))
          ? Math.round(averageResponseMs(player))
          : null,
      }));
  }

  private buildRoundChoices(session: RoomSession, round: number) {
    const existing = session.roundChoices.get(round);
    if (existing) return existing;

    const track = session.trackPool[round - 1];
    if (!track) return [];

    const correct = asChoiceLabel(track);
    const previousCorrectAnswers = new Set(
      session.trackPool
        .slice(0, Math.max(0, round - 1))
        .map(asChoiceLabel),
    );
    const distractors = randomShuffle(
      session.trackPool
        .filter((candidate) => candidate.id !== track.id)
        .map(asChoiceLabel)
        .filter((value) => value !== correct)
        .filter((value) => !previousCorrectAnswers.has(value)),
    );

    const uniqueOptions = [correct];
    const seen = new Set(uniqueOptions);
    for (const distractor of distractors) {
      if (seen.has(distractor)) continue;
      uniqueOptions.push(distractor);
      seen.add(distractor);
      if (uniqueOptions.length >= 4) break;
    }

    let syntheticIndex = 1;
    while (uniqueOptions.length < 4) {
      const syntheticChoice = `Choix alternatif ${round}-${syntheticIndex}`;
      syntheticIndex += 1;
      if (seen.has(syntheticChoice)) continue;
      uniqueOptions.push(syntheticChoice);
      seen.add(syntheticChoice);
    }

    const options = randomShuffle(uniqueOptions);
    session.roundChoices.set(round, options);
    return options;
  }

  private async buildStartTrackPool(categoryQuery: string, requestedRounds: number) {
    const safeRounds = Math.max(1, requestedRounds);
    const collected: MusicTrack[] = [];
    const seen = new Set<string>();
    const maxAttempts = 6;
    const maxFetchSize = 50;
    let requestSize = Math.min(maxFetchSize, Math.max(safeRounds * 2, safeRounds));
    let rawTotal = 0;
    let playableTotal = 0;
    let cleanTotal = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const rawTrackPool = await withTimeout(
        this.getTrackPool(categoryQuery, requestSize),
        15_000,
        "TRACK_POOL_LOAD_TIMEOUT",
      );
      rawTotal += rawTrackPool.length;

      const playablePool = rawTrackPool.filter((track) => isTrackPlayable(track));
      playableTotal += playablePool.length;
      const cleanPool = playablePool.filter((track) => !looksLikePromotionalTrack(track));
      cleanTotal += cleanPool.length;

      let added = 0;
      for (const track of randomShuffle(cleanPool)) {
        const signature = trackSignature(track);
        if (seen.has(signature)) continue;
        seen.add(signature);
        collected.push(track);
        added += 1;
        if (collected.length >= safeRounds) break;
      }

      logEvent("info", "room_start_trackpool_attempt", {
        categoryQuery,
        attempt,
        requestSize,
        rawCount: rawTrackPool.length,
        playableCount: playablePool.length,
        cleanCount: cleanPool.length,
        addedCount: added,
        accumulated: collected.length,
        requestedRounds: safeRounds,
      });

      if (collected.length >= safeRounds) break;
      if (rawTrackPool.length <= 0 || cleanPool.length <= 0) {
        break;
      }

      const nextSize = Math.min(
        maxFetchSize,
        Math.max(requestSize + safeRounds, Math.ceil(requestSize * 1.5)),
      );
      const reachedCeiling = requestSize >= maxFetchSize;
      if (added <= 0 && reachedCeiling) break;
      requestSize = nextSize;
    }

    return {
      tracks: randomShuffle(collected).slice(0, safeRounds),
      rawTotal,
      playableTotal,
      cleanTotal,
    };
  }

  private stopPreloadJob(roomCode: string) {
    this.roomPreloadJobs.delete(roomCode);
  }

  private refreshRoundPlan(session: RoomSession) {
    const plannedRounds = Math.min(session.trackPool.length, this.config.maxRounds);
    session.totalRounds = plannedRounds;
    if (plannedRounds <= 0) {
      session.roundModes = [];
      return;
    }

    for (let round = session.roundModes.length + 1; round <= plannedRounds; round += 1) {
      session.roundModes.push(modeForRound(round));
    }
    if (session.roundModes.length > plannedRounds) {
      session.roundModes = session.roundModes.slice(0, plannedRounds);
    }

    if (session.manager.state() !== "waiting" && session.manager.state() !== "results") {
      session.manager.setTotalRounds(plannedRounds);
    }
  }

  private mergeResolvedTracks(session: RoomSession, tracks: MusicTrack[], targetPoolSize: number) {
    const existing = new Set(session.trackPool.map((track) => trackSignature(track)));
    for (const track of tracks) {
      const signature = trackSignature(track);
      if (existing.has(signature)) continue;
      session.trackPool.push(track);
      existing.add(signature);
      if (session.trackPool.length >= targetPoolSize) break;
    }
  }

  private startTrackPreload(session: RoomSession, categoryQuery: string, targetRounds: number) {
    if (this.roomPreloadJobs.has(session.roomCode)) return;

    const roomCode = session.roomCode;
    const preloadPromise = (async () => {
      const desiredPoolSize = Math.min(40, Math.max(targetRounds * 2, targetRounds));
      const rawTrackPool = await this.getTrackPool(categoryQuery, desiredPoolSize);
      const playablePool = rawTrackPool.filter((track) => isTrackPlayable(track));
      const cleanPool = playablePool.filter((track) => !looksLikePromotionalTrack(track));
      const shuffled = randomShuffle(cleanPool);

      const beforeCount = session.trackPool.length;
      this.mergeResolvedTracks(session, shuffled, desiredPoolSize);
      this.refreshRoundPlan(session);

      const added = Math.max(0, session.trackPool.length - beforeCount);
      if (added > 0) {
        logEvent("info", "room_preload_tracks_completed", {
          roomCode,
          categoryQuery,
          desiredPoolSize,
          targetRounds,
          added,
          totalResolved: session.trackPool.length,
          totalRounds: session.totalRounds,
        });
      } else {
        logEvent("warn", "room_preload_tracks_no_new_tracks", {
          roomCode,
          categoryQuery,
          desiredPoolSize,
          targetRounds,
          totalResolved: session.trackPool.length,
          totalRounds: session.totalRounds,
        });
      }
    })()
      .catch((error) => {
        logEvent("warn", "room_preload_tracks_failed", {
          roomCode,
          categoryQuery,
          desiredPoolSize: Math.min(40, Math.max(targetRounds * 2, targetRounds)),
          targetRounds,
          error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        });
      })
      .finally(() => {
        this.stopPreloadJob(roomCode);
      });

    this.roomPreloadJobs.set(roomCode, preloadPromise);
  }

  private isAnswerCorrect(roundMode: RoundMode, answer: string, track: MusicTrack | null) {
    if (!track) return false;

    if (roundMode === "mcq") {
      const expected = normalizeAnswer(asChoiceLabel(track));
      return normalizeAnswer(answer) === expected;
    }

    return (
      isTextAnswerCorrect(answer, track.title) ||
      isTextAnswerCorrect(answer, track.artist) ||
      isTextAnswerCorrect(answer, `${track.title} ${track.artist}`) ||
      isTextAnswerCorrect(answer, asChoiceLabel(track))
    );
  }

  private isSpotifyRateLimitedRecently() {
    const spotify = providerMetricsSnapshot().spotify;
    if (!spotify || spotify.lastStatus !== 429) return false;
    const lastSeenAtMs = Date.parse(spotify.lastSeenAt);
    if (!Number.isFinite(lastSeenAtMs)) return true;
    return Date.now() - lastSeenAtMs <= 30_000;
  }

  private progressSession(session: RoomSession, nowMs: number) {
    const tick = session.manager.tick({
      nowMs,
      roundMs: this.config.playingMs,
      revealMs: this.config.revealMs,
      leaderboardMs: this.config.leaderboardMs,
    });

    if (tick.closedRounds.length === 0) return;

    for (const closedRound of tick.closedRounds) {
      this.applyRoundResults(session, closedRound);
    }
  }

  private applyRoundResults(session: RoomSession, round: ClosedRound) {
    const track = session.trackPool[round.round - 1] ?? null;
    const roundMode = session.roundModes[round.round - 1] ?? "text";
    const roundChoices =
      roundMode === "mcq" ? this.buildRoundChoices(session, round.round) : null;

    for (const player of session.players.values()) {
      const submitted = round.answers.get(player.id);
      const isCorrect = submitted ? this.isAnswerCorrect(roundMode, submitted.value, track) : false;
      const responseMs =
        submitted && isCorrect ? Math.max(0, submitted.submittedAtMs - round.startedAtMs) : 0;
      const scoring = applyScore({
        isCorrect,
        responseMs,
        streak: player.streak,
        baseScore: this.config.baseScore,
      });

      player.score += scoring.earned;
      player.streak = scoring.nextStreak;
      player.maxStreak = Math.max(player.maxStreak, player.streak);

      if (isCorrect) {
        player.correctAnswers += 1;
        player.totalResponseMs += responseMs;
      }
    }

    session.latestReveal = track
      ? {
          round: round.round,
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          provider: track.provider,
          mode: roundMode,
          acceptedAnswer: asChoiceLabel(track),
          previewUrl: track.previewUrl,
          sourceUrl: track.sourceUrl,
          embedUrl: embedUrlForTrack(track),
          choices: roundChoices,
        }
      : null;
  }

  createRoom(options: { isPublic?: boolean; categoryQuery?: string } = {}) {
    const nowMs = this.now();
    let roomCode = randomRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = randomRoomCode();
    }

    const session: RoomSession = {
      roomCode,
      createdAtMs: nowMs,
      isPublic: options.isPublic ?? true,
      manager: new RoomManager(roomCode),
      players: new Map(),
      hostPlayerId: null,
      nextPlayerNumber: 1,
      trackPool: [],
      categoryQuery: options.categoryQuery?.trim() ?? "",
      totalRounds: 0,
      roundModes: [],
      roundChoices: new Map(),
      latestReveal: null,
    };

    this.rooms.set(roomCode, session);
    return { roomCode };
  }

  joinRoom(roomCode: string, displayName: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    if (session.manager.state() === "results") {
      return { status: "room_not_joinable" as const };
    }

    const playerId = `p${session.nextPlayerNumber}`;
    session.nextPlayerNumber += 1;

    const player: Player = {
      id: playerId,
      userId: null,
      displayName,
      joinedAtMs: this.now(),
      isReady: false,
      score: 0,
      streak: 0,
      maxStreak: 0,
      totalResponseMs: 0,
      correctAnswers: 0,
    };

    session.players.set(playerId, player);
    this.ensureHost(session);
    this.resetReadyStates(session);

    return {
      status: "ok" as const,
      value: {
        ok: true as const,
        playerId,
        playerCount: session.players.size,
        hostPlayerId: session.hostPlayerId,
      },
    };
  }

  joinRoomAsUser(roomCode: string, displayName: string, userId: string | null) {
    const joined = this.joinRoom(roomCode, displayName);
    if (joined.status !== "ok") return joined;

    const session = this.rooms.get(roomCode);
    const player = session?.players.get(joined.value.playerId);
    if (player) {
      player.userId = userId;
    }

    return joined.value;
  }

  setRoomSource(roomCode: string, playerId: string, categoryQuery: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    const normalized = categoryQuery.trim();
    if (normalized.length <= 0) return { status: "invalid_payload" as const };

    session.categoryQuery = normalized;
    this.resetReadyStates(session);
    return { status: "ok" as const, categoryQuery: normalized };
  }

  setPlayerReady(roomCode: string, playerId: string, ready: boolean) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };
    player.isReady = ready;
    return { status: "ok" as const, isReady: player.isReady };
  }

  kickPlayer(roomCode: string, hostPlayerId: string, targetPlayerId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(hostPlayerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== hostPlayerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };
    if (hostPlayerId === targetPlayerId) return { status: "invalid_payload" as const };
    if (!session.players.has(targetPlayerId)) return { status: "target_not_found" as const };

    session.players.delete(targetPlayerId);
    this.ensureHost(session);
    this.resetReadyStates(session);
    return { status: "ok" as const, playerCount: session.players.size };
  }

  removePlayer(roomCode: string, playerId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };

    session.players.delete(playerId);
    if (session.players.size <= 0) {
      this.stopPreloadJob(roomCode);
      this.rooms.delete(roomCode);
      return { status: "ok" as const, playerCount: 0, hostPlayerId: null };
    }
    this.ensureHost(session);
    if (session.manager.state() === "waiting") {
      this.resetReadyStates(session);
    }

    return { status: "ok" as const, playerCount: session.players.size, hostPlayerId: session.hostPlayerId };
  }

  replayRoom(roomCode: string, playerId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "results") return { status: "invalid_state" as const };

    this.stopPreloadJob(roomCode);
    session.manager.resetToWaiting();
    session.trackPool = [];
    session.totalRounds = 0;
    session.roundModes = [];
    session.roundChoices.clear();
    session.latestReveal = null;
    session.categoryQuery = "";
    this.resetReadyStates(session);

    for (const player of session.players.values()) {
      player.score = 0;
      player.streak = 0;
      player.maxStreak = 0;
      player.totalResponseMs = 0;
      player.correctAnswers = 0;
    }

    return {
      status: "ok" as const,
      roomCode: session.roomCode,
      state: session.manager.state(),
      playerCount: session.players.size,
      categoryQuery: session.categoryQuery,
    };
  }

  async startGame(roomCode: string, playerId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;
    this.ensureHost(session);

    if (!session.players.has(playerId)) {
      return {
        ok: false as const,
        error: "PLAYER_NOT_FOUND" as const,
      };
    }
    if (session.hostPlayerId !== playerId) {
      return {
        ok: false as const,
        error: "HOST_ONLY" as const,
      };
    }
    if (session.manager.state() !== "waiting") {
      return {
        ok: false as const,
        error: "INVALID_STATE" as const,
      };
    }
    if (session.players.size <= 0) {
      return {
        ok: false as const,
        error: "NO_PLAYERS" as const,
      };
    }
    if (session.categoryQuery.trim().length <= 0) {
      return {
        ok: false as const,
        error: "SOURCE_NOT_SET" as const,
      };
    }

    const allReady = [...session.players.values()].every((player) => player.isReady);
    if (!allReady) {
      return {
        ok: false as const,
        error: "PLAYERS_NOT_READY" as const,
      };
    }

    const poolSize = Math.max(1, this.config.maxRounds);
    const resolvedQuery = session.categoryQuery;
    const startupLoadStartedAt = Date.now();
    logEvent("info", "room_start_trackpool_loading_begin", {
      roomCode,
      categoryQuery: resolvedQuery,
      startupPoolSize: poolSize,
      requestedRounds: poolSize,
      players: session.players.size,
    });

    let startPoolStats: {
      tracks: MusicTrack[];
      rawTotal: number;
      playableTotal: number;
      cleanTotal: number;
    };
    try {
      startPoolStats = await this.buildStartTrackPool(resolvedQuery, poolSize);
    } catch (error) {
      if (error instanceof Error && error.message === SPOTIFY_RATE_LIMITED_ERROR) {
        return {
          ok: false as const,
          error: "SPOTIFY_RATE_LIMITED" as const,
          retryAfterMs: spotifyPlaylistRateLimitRetryAfterMs(),
        };
      }

      logEvent("warn", "room_start_trackpool_loading_failed", {
        roomCode,
        categoryQuery: resolvedQuery,
        startupPoolSize: poolSize,
        requestedRounds: poolSize,
        durationMs: Date.now() - startupLoadStartedAt,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
      return {
        ok: false as const,
        error: "NO_TRACKS_FOUND" as const,
      };
    }

    logEvent("info", "room_start_trackpool_loading_done", {
      roomCode,
      categoryQuery: resolvedQuery,
      startupPoolSize: poolSize,
      requestedRounds: poolSize,
      durationMs: Date.now() - startupLoadStartedAt,
      rawTrackPoolSize: startPoolStats.rawTotal,
      playablePoolSize: startPoolStats.playableTotal,
      cleanPoolSize: startPoolStats.cleanTotal,
      selectedPoolSize: startPoolStats.tracks.length,
    });

    session.trackPool = startPoolStats.tracks;
    session.latestReveal = null;
    this.refreshRoundPlan(session);

    if (session.totalRounds < poolSize || session.trackPool.length < poolSize) {
      if (resolvedQuery.toLowerCase().startsWith("spotify:") && this.isSpotifyRateLimitedRecently()) {
        return {
          ok: false as const,
          error: "SPOTIFY_RATE_LIMITED" as const,
          retryAfterMs: spotifyPlaylistRateLimitRetryAfterMs(),
        };
      }

      logEvent("warn", "room_start_no_tracks", {
        roomCode,
        categoryQuery: resolvedQuery,
        requestedPoolSize: poolSize,
        selectedPoolSize: session.trackPool.length,
        players: session.players.size,
      });
      return {
        ok: false as const,
        error: "NO_TRACKS_FOUND" as const,
      };
    }

    session.roundChoices.clear();
    for (let round = 1; round <= session.totalRounds; round += 1) {
      if (session.roundModes[round - 1] === "mcq") this.buildRoundChoices(session, round);
    }

    for (const player of session.players.values()) {
      player.score = 0;
      player.streak = 0;
      player.maxStreak = 0;
      player.totalResponseMs = 0;
      player.correctAnswers = 0;
      player.isReady = false;
    }

    const tracksWithPreview = session.trackPool.filter((track) => hasAudioPreview(track)).length;
    const tracksWithYouTube = session.trackPool.filter((track) => hasYouTubePlayback(track)).length;
    logEvent("info", "room_start_audio_preview_coverage", {
      roomCode,
      categoryQuery: resolvedQuery,
      poolSize: session.trackPool.length,
      rawPoolSize: startPoolStats.rawTotal,
      playablePoolSize: startPoolStats.playableTotal,
      removedPromotionalTracks: Math.max(
        0,
        startPoolStats.playableTotal - startPoolStats.cleanTotal,
      ),
      previewCount: tracksWithPreview,
      youtubePlaybackCount: tracksWithYouTube,
      players: session.players.size,
    });

    session.manager.startGame({
      nowMs: this.now(),
      countdownMs: this.config.countdownMs,
      totalRounds: session.totalRounds,
    });

    this.progressSession(session, this.now());

    return {
      ok: true as const,
      state: session.manager.state(),
      poolSize: session.trackPool.length,
      categoryQuery: session.categoryQuery,
      totalRounds: session.totalRounds,
      deadlineMs: session.manager.deadlineMs(),
    };
  }

  skipCurrentRound(roomCode: string, playerId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };

    const nowMs = this.now();
    this.progressSession(session, nowMs);
    if (session.manager.state() !== "playing") return { status: "invalid_state" as const };

    const skipped = session.manager.skipPlayingRound({
      nowMs,
      roundMs: this.config.playingMs,
    });
    if (!skipped.skipped || !skipped.closedRound) {
      return { status: "invalid_state" as const };
    }

    this.applyRoundResults(session, skipped.closedRound);
    return {
      status: "ok" as const,
      state: session.manager.state(),
      round: session.manager.round(),
      deadlineMs: session.manager.deadlineMs(),
    };
  }

  submitAnswer(roomCode: string, playerId: string, answer: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };

    const nowMs = this.now();
    this.progressSession(session, nowMs);

    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };

    const result = session.manager.submitAnswer(playerId, answer, nowMs);
    return { status: "ok" as const, accepted: result.accepted };
  }

  roomState(roomCode: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;

    this.progressSession(session, this.now());

    const state = session.manager.state() as GameState;
    const currentRound = session.manager.round();
    const activeTrack = currentRound > 0 ? (session.trackPool[currentRound - 1] ?? null) : null;
    const currentMode = currentRound > 0 ? (session.roundModes[currentRound - 1] ?? null) : null;
    const choices =
      state === "playing" && currentMode === "mcq"
        ? this.buildRoundChoices(session, currentRound)
        : null;
    const hostPlayerId = this.ensureHost(session);
    const players = this.sortedPlayers(session).map((player) => ({
      playerId: player.id,
      displayName: player.displayName,
      isReady: player.isReady,
      isHost: player.id === hostPlayerId,
    }));
    const readyCount = players.filter((player) => player.isReady).length;
    const allReady = players.length > 0 && readyCount === players.length;
    const canStart = state === "waiting" && allReady && session.categoryQuery.trim().length > 0;
    const leaderboard = this.ranking(session).slice(0, 10);
    const revealMedia =
      state === "reveal" || state === "leaderboard" || state === "results"
        ? session.latestReveal
        : null;
    const media =
      state === "playing" && activeTrack
        ? {
            provider: activeTrack.provider,
            trackId: activeTrack.id,
            sourceUrl: activeTrack.sourceUrl,
            embedUrl: embedUrlForTrack(activeTrack),
          }
        : revealMedia
          ? {
              provider: revealMedia.provider,
              trackId: revealMedia.trackId,
              sourceUrl: revealMedia.sourceUrl,
              embedUrl: revealMedia.embedUrl,
            }
          : null;

    return {
      roomCode: session.roomCode,
      state,
      round: currentRound,
      mode: currentMode,
      choices,
      serverNowMs: this.now(),
      playerCount: session.players.size,
      hostPlayerId,
      players,
      readyCount,
      allReady,
      canStart,
      poolSize: session.trackPool.length,
      categoryQuery: session.categoryQuery,
      totalRounds: session.totalRounds,
      deadlineMs: session.manager.deadlineMs(),
      previewUrl:
        state === "playing"
          ? activeTrack?.previewUrl ?? null
          : revealMedia?.previewUrl ?? null,
      media,
      reveal: revealMedia,
      leaderboard,
    };
  }

  roomResults(roomCode: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;

    this.progressSession(session, this.now());

    return {
      roomCode: session.roomCode,
      categoryQuery: session.categoryQuery,
      state: session.manager.state() as GameState,
      round: session.manager.round(),
      ranking: this.ranking(session),
    };
  }

  diagnostics() {
    let totalPlayers = 0;
    const stateCounts: Record<string, number> = {};

    for (const session of this.rooms.values()) {
      totalPlayers += session.players.size;
      const state = session.manager.state();
      stateCounts[state] = (stateCounts[state] ?? 0) + 1;
    }

    return {
      roomCount: this.rooms.size,
      totalPlayers,
      stateCounts,
      config: this.config,
    };
  }

  publicRooms() {
    const nowMs = this.now();
    const visibleStates = new Set<GameState>([
      "waiting",
      "countdown",
      "playing",
      "reveal",
      "leaderboard",
    ]);

    const rooms: Array<{
      roomCode: string;
      isPublic: boolean;
      state: GameState;
      round: number;
      totalRounds: number;
      playerCount: number;
      categoryQuery: string;
      createdAtMs: number;
      canJoin: boolean;
      deadlineMs: number | null;
      serverNowMs: number;
    }> = [];

    for (const session of this.rooms.values()) {
      if (!session.isPublic) continue;
      this.progressSession(session, nowMs);
      const state = session.manager.state() as GameState;
      if (!visibleStates.has(state)) continue;

      rooms.push({
        roomCode: session.roomCode,
        isPublic: session.isPublic,
        state,
        round: session.manager.round(),
        totalRounds: session.totalRounds,
        playerCount: session.players.size,
        categoryQuery: session.categoryQuery,
        createdAtMs: session.createdAtMs,
        canJoin: true,
        deadlineMs: session.manager.deadlineMs(),
        serverNowMs: nowMs,
      });
    }

    return rooms.sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 50);
  }
}

export const roomStore = new RoomStore();
