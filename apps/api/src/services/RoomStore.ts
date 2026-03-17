import { isTextAnswerCorrect } from "./FuzzyMatcher";
import { logEvent } from "../lib/logger";
import { providerMetricsSnapshot } from "../lib/provider-metrics";
import { applyScore } from "./ScoreCalculator";
import { hasAudioPreview, hasYouTubePlayback, isTrackPlayable } from "./PlaybackSupport";
import type { ClosedRound, GameState } from "./RoomManager";
import { RoomManager } from "./RoomManager";
import { trackCache } from "./TrackCache";
import type { MusicTrack } from "./music-types";
import { getRomanizedJapaneseCached, scheduleRomanizeJapanese } from "./JapaneseRomanizer";
import { SPOTIFY_RATE_LIMITED_ERROR, spotifyPlaylistRateLimitRetryAfterMs } from "../routes/music/spotify";
import { fetchUserLikedTracksForProviders as fetchSyncedUserLikedTracksForProviders } from "./UserMusicLibrary";
import { pool } from "../db/client";
import { readEnvVar } from "../lib/env";
import { userAnimeLibraryRepository } from "../repositories/UserAnimeLibraryRepository";
import { userLikedTrackRepository } from "../repositories/UserLikedTrackRepository";
import {
  contentFilterSqlCondition,
  difficultySqlCondition,
  normalizeRoomContentFilters,
  type RoomContentFilters,
  type RoomDifficultyFilter,
} from "./AniListRoomFilters";
import { normalizeAnimeText } from "./AnimeTextNormalization";
import {
  fetchAniListMediaMetadataBySearchBatch,
} from "./AniListTitleLookup";
import {
  fetchRandomAniListAnimeCandidates,
  AniListRemoteFailureError,
  MAX_RANDOM_ANIME_DISCOVERY_IDS,
  type AniListRandomAnimeCandidate,
} from "./AniListRandomAnimeSource";
import { animeThemesProxyCache } from "./AnimeThemesProxyCache";
import { normalizeAnimeAlias } from "./AnimeThemesCatalogService";
import { RoundSyncCoordinator } from "./RoundSyncCoordinator";
import type {
  RoomAnswerMode as SharedRoomAnswerMode,
  RoomSourceMode as SharedRoomSourceMode,
  RoundChoice as SharedRoundChoice,
  RoundMode as SharedRoundMode,
} from "../../../../packages/shared/src/room";
import {
  asChoiceLabel as formatRoundChoiceLabel,
  buildRoundChoices as buildMcqRoundChoices,
  englishTitleForTrack as formatEnglishTitleForTrack,
} from "./roundChoiceBuilder";
import { createRoomSnapshot } from "./roomSnapshot";

export type RoundMode = SharedRoundMode;
export type RoundChoice = SharedRoundChoice;
type RoomSourceMode = SharedRoomSourceMode;
type RoomThemeMode = "op_only" | "ed_only" | "mix";
type RoomAnswerMode = SharedRoomAnswerMode;
type LibraryProvider = "spotify" | "deezer";
type ProviderLinkStatus = "linked" | "not_linked" | "expired";
type PoolBuildStatus = "idle" | "building" | "ready" | "failed";

type PlayerLibraryState = {
  includeInPool: Record<LibraryProvider, boolean>;
  linkedProviders: Record<LibraryProvider, ProviderLinkStatus>;
  estimatedTrackCount: Record<LibraryProvider, number | null>;
  syncStatus: "idle" | "syncing" | "ready" | "error";
  lastError: string | null;
};

export type Player = {
  id: string;
  userId: string | null;
  displayName: string;
  joinedAtMs: number;
  isReady: boolean;
  score: number;
  lastRoundScore: number;
  streak: number;
  maxStreak: number;
  totalResponseMs: number;
  correctAnswers: number;
  lives: number;
  isEliminated: boolean;
  library: PlayerLibraryState;
};

type RoomChatMessage = {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  sentAtMs: number;
};

export type RoomSession = {
  roomCode: string;
  createdAtMs: number;
  isPublic: boolean;
  manager: RoomManager;
  roundSync: RoundSyncCoordinator;
  roundSyncRound: number | null;
  players: Map<string, Player>;
  hostPlayerId: string | null;
  nextPlayerNumber: number;
  trackPool: MusicTrack[];
  distractorTrackPool: MusicTrack[];
  sourceMode: RoomSourceMode;
  themeMode: RoomThemeMode;
  difficultyFilter: RoomDifficultyFilter;
  contentFilters: RoomContentFilters;
  answerMode: RoomAnswerMode;
  livesMode: boolean;
  maxLives: number;
  roomRoundConfig: {
    maxRounds: number;
    playingMs: number;
    revealMs: number;
  };
  publicPlaylistSelection: {
    provider: "deezer";
    id: string;
    name: string;
    trackCount: number | null;
    sourceQuery: string;
    selectedByPlayerId: string;
  } | null;
  playersLikedRules: {
    minContributors: number;
    minTotalTracks: number;
  };
  playersLikedPool: MusicTrack[];
  poolBuild: {
    status: PoolBuildStatus;
    contributorsCount: number;
    mergedTracksCount: number;
    playableTracksCount: number;
    lastBuiltAtMs: number | null;
    errorCode: string | null;
  };
  isResolvingTracks: boolean;
  trackResolutionJobsInFlight: number;
  categoryQuery: string;
  totalRounds: number;
  roundModes: RoundMode[];
  roundChoices: Map<number, RoundChoice[]>;
  latestReveal: {
    round: number;
    trackId: string;
    title: string;
    titleRomaji: string | null;
    titleEnglish: string | null;
    artist: string;
    artistRomaji: string | null;
    songTitle: string | null;
    songArtists: string[];
    provider: MusicTrack["provider"];
    mode: RoundMode;
    acceptedAnswer: string;
    previewUrl: string | null;
    sourceUrl: string | null;
    embedUrl: string | null;
    choices: RoundChoice[] | null;
    playerAnswers: Array<{
      playerId: string;
      displayName: string;
      answer: string | null;
      submitted: boolean;
      isCorrect: boolean;
    }>;
  } | null;
  chatMessages: RoomChatMessage[];
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_ROUND_CONFIG = {
  countdownMs: 3_000,
  loadingMs: 6_000,
  loadingTimeoutMs: 30_000,
  playingMs: 20_000,
  revealMs: 20_000,
  leaderboardMs: 0,
  baseScore: 1_000,
  maxRounds: 10,
} as const;

const TRACK_POOL_TARGET_MULTIPLIER = 5;
const TRACK_POOL_MIN_CANDIDATES = 24;
const TRACK_POOL_MAX_CANDIDATES = 100;
const ANILIST_TRACK_POOL_TARGET_MULTIPLIER = 8;
const ANILIST_TRACK_POOL_MIN_CANDIDATES = 48;
const ANILIST_TRACK_POOL_MAX_CANDIDATES = 240;
const YOUTUBE_RANDOM_START_MIN_SEC = 18;
const YOUTUBE_RANDOM_START_END_BUFFER_SEC = 20;
const YOUTUBE_RANDOM_START_MIN_DURATION_SEC = 45;
const ANIMETHEMES_RANDOM_START_ROUND_BUFFER_SEC = Math.max(
  1,
  Math.floor(DEFAULT_ROUND_CONFIG.playingMs / 1_000),
);
const MCQ_REQUIRED_CHOICES = 4;
const START_POOL_RETRY_ATTEMPTS = 3;
const START_POOL_RETRY_DELAY_MS = 900;
const PLAYERS_LIKED_POOL_BUILD_TIMEOUT_MS = 45_000;
const ROOM_ANSWER_SUGGESTION_LIMIT = 1_000;
const ROOM_BULK_ANSWER_TRACK_LIMIT = 16_000;
const ROOM_BULK_ANSWER_SUGGESTION_LIMIT = 24_000;
const ROUND_SYNC_START_LEAD_MS = 900;
const ROUND_SYNC_MAX_WAIT_MS = 2_000;
const ANILIST_ENGLISH_BACKFILL_BATCH_SIZE = 24;
const ANILIST_DIFFICULTY_START_BACKFILL_LIMIT = 48;
const RANDOM_CLASSIC_DISCOVERY_ATTEMPTS = 4;
const DEFAULT_ROOM_CONTENT_FILTERS: RoomContentFilters = {
  decades: [],
  genres: [],
};
const DEFAULT_MAX_LIVES = 3;

function readApiBaseUrl() {
  const fromBetterAuth = readEnvVar("BETTER_AUTH_URL")?.trim() ?? "";
  if (fromBetterAuth.length > 0) {
    return fromBetterAuth.replace(/\/+$/, "");
  }

  const fromRailwayDomain = readEnvVar("RAILWAY_PUBLIC_DOMAIN")?.trim() ?? "";
  if (fromRailwayDomain.length > 0) {
    const withProtocol =
      fromRailwayDomain.startsWith("http://") || fromRailwayDomain.startsWith("https://")
        ? fromRailwayDomain
        : `https://${fromRailwayDomain}`;
    return withProtocol.replace(/\/+$/, "");
  }

  return "http://127.0.0.1:3001";
}

function animethemesProxyUrl(videoKey: string) {
  return `${readApiBaseUrl()}/quiz/media/animethemes/${encodeURIComponent(videoKey)}`;
}

type RoundConfig = typeof DEFAULT_ROUND_CONFIG;

function isLegacyPlayersLikedSource(mode: RoomSourceMode) {
  return mode === "players_liked";
}

function isAniListUnionSource(mode: RoomSourceMode) {
  return mode === "anilist_union";
}

function isRandomClassicSource(mode: RoomSourceMode) {
  return mode === "random_classic";
}

type RoomStoreDependencies = {
  now?: () => number;
  getTrackPool?: (categoryQuery: string, size: number) => Promise<MusicTrack[]>;
  getPlayerLikedTracks?: (input: {
    userId: string;
    providers: LibraryProvider[];
    size: number;
    allowExternalResolve?: boolean;
  }) => Promise<MusicTrack[]>;
  warmAnimeThemeVideo?: (videoKey: string) => Promise<void>;
  config?: Partial<RoundConfig>;
  getRandomAniListAnimeCandidates?: (input: {
    seed: string;
    desiredCount: number;
    themeMode: RoomThemeMode;
  }) => Promise<AniListRandomAnimeCandidate[]>;
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
  return normalizeAnimeText(value);
}

function collectAnswerVariants(track: MusicTrack) {
  const variants = new Set<string>();

  const push = (value: string | null | undefined) => {
    const normalized = value?.trim() ?? "";
    if (normalized.length <= 0) return;
    variants.add(normalized);
  };

  push(track.title);
  push(track.artist);
  push(`${track.title} ${track.artist}`);
  push(formatRoundChoiceLabel(track));
  for (const alias of track.answer?.aliases ?? []) {
    push(alias);
  }

  const titleRomaji = getRomanizedJapaneseCached(track.title);
  const artistRomaji = getRomanizedJapaneseCached(track.artist);
  push(titleRomaji);
  push(artistRomaji);

  if (titleRomaji && artistRomaji) {
    push(`${titleRomaji} ${artistRomaji}`);
    push(`${titleRomaji} - ${artistRomaji}`);
  }
  if (titleRomaji) {
    push(`${titleRomaji} ${track.artist}`);
    push(`${titleRomaji} - ${track.artist}`);
  }
  if (artistRomaji) {
    push(`${track.title} ${artistRomaji}`);
    push(`${track.title} - ${artistRomaji}`);
  }

  return [...variants];
}

function averageResponseMs(player: Player) {
  if (player.correctAnswers <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return player.totalResponseMs / player.correctAnswers;
}

function defaultRoomContentFilters(): RoomContentFilters {
  return {
    decades: [...DEFAULT_ROOM_CONTENT_FILTERS.decades],
    genres: [...DEFAULT_ROOM_CONTENT_FILTERS.genres],
  };
}

function modeForRound(round: number, answerMode: RoomAnswerMode): RoundMode {
  if (answerMode === "mcq_only") return "mcq";
  if (answerMode === "text_only") return "text";
  return round % 2 === 1 ? "mcq" : "text";
}

function collectRoomAnswerSuggestions(
  tracks: Array<Pick<MusicTrack, "title" | "artist" | "answer">>,
  limit = ROOM_ANSWER_SUGGESTION_LIMIT,
) {
  const values: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null | undefined) => {
    const normalized = value?.trim() ?? "";
    if (normalized.length < 2) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    values.push(normalized);
  };

  for (const track of tracks) {
    const title = track.title.trim();
    const artist = track.artist.trim();
    const titleRomaji = getRomanizedJapaneseCached(title);
    const artistRomaji = getRomanizedJapaneseCached(artist);

    push(title);
    push(artist);
    push(titleRomaji);
    push(artistRomaji);
    for (const alias of track.answer?.aliases ?? []) {
      push(alias);
    }

    if (values.length >= limit) break;
  }

  return values.slice(0, limit);
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

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function deterministicIntFromSeed(seed: string, min: number, max: number) {
  const safeMin = Math.max(0, Math.floor(min));
  const safeMax = Math.max(safeMin, Math.floor(max));
  const size = safeMax - safeMin + 1;
  if (size <= 1) return safeMin;
  return safeMin + (stableHash(seed) % size);
}

function youtubeRoundStartSeconds(
  track: Pick<MusicTrack, "id" | "durationSec">,
  context: { roomCode: string; round: number },
) {
  const durationSec =
    typeof track.durationSec === "number" && Number.isFinite(track.durationSec)
      ? Math.max(0, Math.floor(track.durationSec))
      : null;

  if (durationSec !== null && durationSec < YOUTUBE_RANDOM_START_MIN_DURATION_SEC) {
    return 0;
  }
  if (durationSec === null) return 0;

  const minStart = YOUTUBE_RANDOM_START_MIN_SEC;
  const maxStart = Math.max(minStart, durationSec - YOUTUBE_RANDOM_START_END_BUFFER_SEC);
  const seed = `${context.roomCode}:${context.round}:${track.id}`;
  return deterministicIntFromSeed(seed, minStart, maxStart);
}

function animethemesRoundStartSeconds(
  track: Pick<MusicTrack, "id" | "durationSec">,
  context: { roomCode: string; round: number },
) {
  const durationSec =
    typeof track.durationSec === "number" && Number.isFinite(track.durationSec)
      ? Math.max(0, Math.floor(track.durationSec))
      : null;

  if (durationSec === null || durationSec <= ANIMETHEMES_RANDOM_START_ROUND_BUFFER_SEC) {
    return 0;
  }

  const maxStart = Math.max(0, durationSec - ANIMETHEMES_RANDOM_START_ROUND_BUFFER_SEC);
  const seed = `${context.roomCode}:${context.round}:${track.id}`;
  return deterministicIntFromSeed(seed, 0, maxStart);
}

function roundMediaOffsetSeconds(
  track: Pick<MusicTrack, "provider" | "id" | "durationSec"> | null,
  context: { roomCode: string; round: number },
) {
  if (!track) return 0;
  if (track.provider === "youtube") {
    return youtubeRoundStartSeconds(track, context);
  }
  if (track.provider === "animethemes") {
    return animethemesRoundStartSeconds(track, context);
  }
  return 0;
}

function embedUrlForTrack(
  track: Pick<MusicTrack, "provider" | "id" | "durationSec">,
  context?: { roomCode: string; round: number },
) {
  if (track.provider === "spotify") {
    return `https://open.spotify.com/embed/track/${track.id}?utm_source=kwizik`;
  }
  if (track.provider === "youtube") {
    const start = context ? youtubeRoundStartSeconds(track, context) : 0;
    return `https://www.youtube.com/embed/${track.id}?autoplay=1&controls=0&disablekb=1&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&fs=0&enablejsapi=1&start=${start}`;
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

async function sleepMs(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function trackSignature(track: Pick<MusicTrack, "provider" | "id" | "title" | "artist">) {
  return `${track.provider}:${track.id}:${track.title.toLowerCase()}:${track.artist.toLowerCase()}`;
}

function defaultPlayerLibraryState(): PlayerLibraryState {
  return {
    includeInPool: {
      spotify: false,
      deezer: false,
    },
    linkedProviders: {
      spotify: "not_linked",
      deezer: "not_linked",
    },
    estimatedTrackCount: {
      spotify: null,
      deezer: null,
    },
    syncStatus: "idle",
    lastError: null,
  };
}

function normalizeProviderLinkStatus(value: ProviderLinkStatus | null | undefined): ProviderLinkStatus {
  if (value === "linked" || value === "expired") return value;
  return "not_linked";
}

export class RoomStore {
  private readonly rooms = new Map<string, RoomSession>();
  private readonly roomPreloadJobs = new Map<string, Promise<void>>();
  private readonly roomLikedPoolJobs = new Map<string, Promise<void>>();
  private readonly roomLikedPoolRebuildRequested = new Set<string>();
  private readonly now: () => number;
  private readonly getTrackPool: (categoryQuery: string, size: number) => Promise<MusicTrack[]>;
  private readonly getPlayerLikedTracks: (input: {
    userId: string;
    providers: LibraryProvider[];
    size: number;
    allowExternalResolve?: boolean;
  }) => Promise<MusicTrack[]>;
  private readonly warmAnimeThemeVideo: (videoKey: string) => Promise<void>;
  private readonly getRandomAniListAnimeCandidates: (input: {
    seed: string;
    desiredCount: number;
    themeMode: RoomThemeMode;
  }) => Promise<AniListRandomAnimeCandidate[]>;
  private readonly config: RoundConfig;

  constructor(dependencies: RoomStoreDependencies = {}) {
    this.now = dependencies.now ?? (() => Date.now());
    this.getTrackPool = dependencies.getTrackPool ?? ((categoryQuery, size) =>
      trackCache.getOrBuild(categoryQuery, size));
    this.getPlayerLikedTracks = dependencies.getPlayerLikedTracks ?? fetchSyncedUserLikedTracksForProviders;
    this.warmAnimeThemeVideo = dependencies.warmAnimeThemeVideo ?? ((videoKey) =>
      animeThemesProxyCache.warmByVideoKey(videoKey).then(() => undefined));
    this.getRandomAniListAnimeCandidates =
      dependencies.getRandomAniListAnimeCandidates ?? fetchRandomAniListAnimeCandidates;
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

  private isPlayerSpectating(session: RoomSession, player: Player | null | undefined) {
    return Boolean(session.livesMode && player?.isEliminated);
  }

  private activePlayers(session: RoomSession) {
    return this.sortedPlayers(session).filter((player) => !this.isPlayerSpectating(session, player));
  }

  private sourceQueryForSession(session: RoomSession) {
    if (session.sourceMode === "public_playlist") {
      return session.publicPlaylistSelection?.sourceQuery?.trim() || session.categoryQuery.trim();
    }
    if (isAniListUnionSource(session.sourceMode)) {
      return "anilist:linked:union";
    }
    if (isRandomClassicSource(session.sourceMode)) {
      return "anilist:random:classic";
    }
    return "players:liked";
  }

  private hasSyncedLibraryTracks(player: Player, provider: LibraryProvider) {
    const estimated = player.library.estimatedTrackCount[provider];
    return typeof estimated === "number" && Number.isFinite(estimated) && estimated > 0;
  }

  private canUsePlayersLikedProvider(player: Player, provider: LibraryProvider) {
    if (!player.library.includeInPool[provider]) return false;
    if (player.library.linkedProviders[provider] === "linked") return true;
    return this.hasSyncedLibraryTracks(player, provider);
  }

  private playersLikedContributors(session: RoomSession) {
    return [...session.players.values()].filter((player) => {
      if (!player.userId) return false;
      const spotifyIncluded = this.canUsePlayersLikedProvider(player, "spotify");
      const deezerIncluded = this.canUsePlayersLikedProvider(player, "deezer");
      return spotifyIncluded || deezerIncluded;
    });
  }

  private canStartWaitingSession(session: RoomSession) {
    if (session.manager.state() !== "waiting") return false;
    if (session.isResolvingTracks) return false;
    if (session.players.size <= 0) return false;

    if (session.sourceMode === "public_playlist") {
      return this.sourceQueryForSession(session).length > 0;
    }
    if (isRandomClassicSource(session.sourceMode)) {
      return true;
    }
    if (isAniListUnionSource(session.sourceMode)) {
      return [...session.players.values()].some((player) => player.userId !== null);
    }

    const contributors = this.playersLikedContributors(session);
    return contributors.length >= session.playersLikedRules.minContributors;
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
        lastRoundScore: player.lastRoundScore,
        streak: player.streak,
        maxStreak: player.maxStreak,
        lives: player.lives,
        isEliminated: player.isEliminated,
        averageResponseMs: Number.isFinite(averageResponseMs(player))
          ? Math.round(averageResponseMs(player))
          : null,
      }));
  }

  private targetCandidatePoolSize(requestedRounds: number) {
    const safeRounds = Math.max(1, requestedRounds);
    return Math.min(
      TRACK_POOL_MAX_CANDIDATES,
      Math.max(
        safeRounds + 3,
        safeRounds * TRACK_POOL_TARGET_MULTIPLIER,
        TRACK_POOL_MIN_CANDIDATES,
      ),
    );
  }

  private targetAniListCandidatePoolSize(requestedRounds: number) {
    const safeRounds = Math.max(1, requestedRounds);
    return Math.min(
      ANILIST_TRACK_POOL_MAX_CANDIDATES,
      Math.max(
        safeRounds + 6,
        safeRounds * ANILIST_TRACK_POOL_TARGET_MULTIPLIER,
        ANILIST_TRACK_POOL_MIN_CANDIDATES,
      ),
    );
  }

  private splitAnswerAndDistractorPools(tracks: MusicTrack[], requestedRounds: number) {
    const safeRounds = Math.max(1, requestedRounds);
    const shuffled = randomShuffle(tracks);
    const answers = shuffled.slice(0, safeRounds);
    const distractors = shuffled.slice(safeRounds);
    return {
      tracks: answers,
      distractorTracks: distractors,
      candidateCount: shuffled.length,
    };
  }

  private buildRoundChoices(session: RoomSession, round: number) {
    return buildMcqRoundChoices({
      round,
      trackPool: session.trackPool,
      distractorTrackPool: session.distractorTrackPool,
      roundChoices: session.roundChoices,
      randomShuffle,
      requiredChoices: MCQ_REQUIRED_CHOICES,
    });
  }

  private async buildStartTrackPool(categoryQuery: string, requestedRounds: number) {
    const safeRounds = Math.max(1, requestedRounds);
    const targetCandidateSize = this.targetCandidatePoolSize(safeRounds);
    const collected: MusicTrack[] = [];
    const seen = new Set<string>();
    const maxAttempts = 6;
    const maxFetchSize = TRACK_POOL_MAX_CANDIDATES;
    let requestSize = Math.min(
      maxFetchSize,
      Math.max(safeRounds * 2, safeRounds + 3, Math.min(targetCandidateSize, 36)),
    );
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
        if (collected.length >= targetCandidateSize) break;
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
        targetCandidateSize,
      });

      if (collected.length >= targetCandidateSize) break;
      if (rawTrackPool.length <= 0 || cleanPool.length <= 0) {
        break;
      }

      const nextSize = Math.min(
        maxFetchSize,
        Math.max(requestSize + safeRounds, Math.ceil(requestSize * 1.5)),
      );
      const reachedCeiling = requestSize >= maxFetchSize;
      const sourceLooksExhausted = rawTrackPool.length < requestSize;
      if (added <= 0 && sourceLooksExhausted) break;
      if (added <= 0 && reachedCeiling) break;
      requestSize = nextSize;
    }

    const split = this.splitAnswerAndDistractorPools(collected, safeRounds);
    return {
      tracks: split.tracks,
      distractorTracks: split.distractorTracks,
      candidateCount: split.candidateCount,
      rawTotal,
      playableTotal,
      cleanTotal,
    };
  }

  private async buildAniListUnionTrackPool(session: RoomSession, requestedRounds: number) {
    const safeRounds = Math.max(1, requestedRounds);
    const targetCandidateSize = this.targetAniListCandidatePoolSize(safeRounds);
    const userIds = [...session.players.values()]
      .map((player) => player.userId)
      .filter((userId): userId is string => typeof userId === "string" && userId.length > 0);
    if (userIds.length <= 0) {
      return {
        tracks: [] as MusicTrack[],
        distractorTracks: [] as MusicTrack[],
        candidateCount: 0,
        rawTotal: 0,
        playableTotal: 0,
        cleanTotal: 0,
      };
    }
    if (!(typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0)) {
      return {
        tracks: [] as MusicTrack[],
        distractorTracks: [] as MusicTrack[],
        candidateCount: 0,
        rawTotal: 0,
        playableTotal: 0,
        cleanTotal: 0,
      };
    }

    const animeLookupLimit = Math.min(20_000, Math.max(targetCandidateSize * 30, 2_000));

    // Get per-user anime IDs for equitable distribution
    const perUserLimit = Math.ceil(animeLookupLimit / userIds.length);
    const perUserAnimeIds = await Promise.all(
      userIds.map((userId) => userAnimeLibraryRepository.animeIdsForUser(userId, perUserLimit)),
    );

    // Round-robin interleave to ensure equitable representation
    const animeIds: number[] = [];
    const seen = new Set<number>();
    let added = true;
    let round = 0;
    while (added && animeIds.length < animeLookupLimit) {
      added = false;
      for (const userAnimeIds of perUserAnimeIds) {
        if (round < userAnimeIds.length) {
          const id = userAnimeIds[round];
          if (!seen.has(id)) {
            seen.add(id);
            animeIds.push(id);
          }
          added = true;
        }
      }
      round++;
    }
    if (animeIds.length <= 0) {
      return {
        tracks: [] as MusicTrack[],
        distractorTracks: [] as MusicTrack[],
        candidateCount: 0,
        rawTotal: 0,
        playableTotal: 0,
        cleanTotal: 0,
      };
    }

    return this.buildAniListTrackPoolFromIds(session, safeRounds, animeIds);
  }

  private async buildRandomClassicTrackPool(session: RoomSession, requestedRounds: number) {
    const safeRounds = Math.max(1, requestedRounds);
    const targetCandidateSize = this.targetAniListCandidatePoolSize(safeRounds);

    if (!(typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0)) {
      return {
        tracks: [] as MusicTrack[],
        distractorTracks: [] as MusicTrack[],
        candidateCount: 0,
        rawTotal: 0,
        playableTotal: 0,
        cleanTotal: 0,
      };
    }

    const baseDesiredCount = Math.min(MAX_RANDOM_ANIME_DISCOVERY_IDS, Math.max(targetCandidateSize * 30, 2_000));
    const baseSeed = `${session.roomCode}:${Date.now()}`;
    const collectedCandidates: AniListRandomAnimeCandidate[] = [];
    const seenMediaIds = new Set<number>();
    let desiredCount = baseDesiredCount;
    let latestBuilt = {
      tracks: [] as MusicTrack[],
      distractorTracks: [] as MusicTrack[],
      candidateCount: 0,
      rawTotal: 0,
      playableTotal: 0,
      cleanTotal: 0,
    };

    for (let attempt = 0; attempt < RANDOM_CLASSIC_DISCOVERY_ATTEMPTS; attempt += 1) {
      let discoveredCandidates: AniListRandomAnimeCandidate[];
      try {
        discoveredCandidates = await this.getRandomAniListAnimeCandidates({
          seed: `${baseSeed}:${attempt}`,
          desiredCount,
          themeMode: session.themeMode,
        });
      } catch (error) {
        if (error instanceof AniListRemoteFailureError && collectedCandidates.length > 0) {
          break;
        }
        throw error;
      }

      let addedCount = 0;
      for (const candidate of discoveredCandidates) {
        if (seenMediaIds.has(candidate.mediaId)) continue;
        seenMediaIds.add(candidate.mediaId);
        collectedCandidates.push(candidate);
        addedCount += 1;
      }

      if (collectedCandidates.length > 0) {
        const catalogAnimeIds = await this.mapAniListCandidatesToCatalogIds(collectedCandidates);
        latestBuilt = await this.buildAniListTrackPoolFromIds(session, safeRounds, catalogAnimeIds);
        if (latestBuilt.tracks.length >= safeRounds) {
          return latestBuilt;
        }
      }

      const reachedDiscoveryCeiling = collectedCandidates.length >= MAX_RANDOM_ANIME_DISCOVERY_IDS;
      const didNotGrow = addedCount <= 0;
      if (reachedDiscoveryCeiling || didNotGrow) {
        break;
      }

      desiredCount = Math.min(
        MAX_RANDOM_ANIME_DISCOVERY_IDS,
        Math.max(desiredCount + baseDesiredCount, Math.floor(desiredCount * 1.5)),
      );
    }

    return latestBuilt;
  }

  private async mapAniListCandidatesToCatalogIds(candidates: AniListRandomAnimeCandidate[]) {
    const aliasesByMediaId = new Map<number, string[]>();
    const allAliases = new Set<string>();

    for (const candidate of candidates) {
      const aliases = Array.from(
        new Set(
          [
            candidate.titleRomaji,
            candidate.titleEnglish,
            candidate.titleNative,
            ...candidate.synonyms,
          ]
            .map((value) => value?.trim() ?? "")
            .filter((value) => value.length > 0)
            .map((value) => normalizeAnimeAlias(value)),
        ),
      );
      if (aliases.length <= 0) continue;
      aliasesByMediaId.set(candidate.mediaId, aliases);
      for (const alias of aliases) {
        allAliases.add(alias);
      }
    }

    if (allAliases.size <= 0) {
      return [];
    }

    const mapped = await pool.query<{
      normalized_alias: string;
      anime_id: number;
      alias_type: "canonical" | "synonym" | "acronym";
    }>(
      `
        select normalized_alias, anime_id, alias_type
        from anime_catalog_alias
        where normalized_alias = any($1::text[])
        union all
        select searchable_romaji as normalized_alias, id as anime_id, 'canonical' as alias_type
        from anime_catalog_anime
        where searchable_romaji = any($1::text[])
      `,
      [[...allAliases]],
    );

    const mappedByAlias = new Map<
      string,
      Array<{
        animeId: number;
        aliasType: "canonical" | "synonym" | "acronym";
      }>
    >();
    for (const row of mapped.rows) {
      const entries = mappedByAlias.get(row.normalized_alias) ?? [];
      entries.push({
        animeId: row.anime_id,
        aliasType: row.alias_type,
      });
      entries.sort((left, right) => {
        const weight = (value: "canonical" | "synonym" | "acronym") =>
          value === "canonical" ? 0 : value === "synonym" ? 1 : 2;
        return weight(left.aliasType) - weight(right.aliasType);
      });
      mappedByAlias.set(row.normalized_alias, entries);
    }

    const updates = new Map<
      number,
      {
        titleEnglish: string | null;
        titleNative: string | null;
        popularity: number | null;
        year: number | null;
        genres: string[];
      }
    >();
    const animeIds: number[] = [];
    const seenAnimeIds = new Set<number>();

    for (const candidate of candidates) {
      const aliases = aliasesByMediaId.get(candidate.mediaId) ?? [];
      let matchedAnimeId: number | null = null;
      for (const alias of aliases) {
        const match = mappedByAlias.get(alias)?.[0];
        if (!match) continue;
        matchedAnimeId = match.animeId;
        break;
      }
      if (matchedAnimeId === null || seenAnimeIds.has(matchedAnimeId)) continue;
      seenAnimeIds.add(matchedAnimeId);
      animeIds.push(matchedAnimeId);
      updates.set(matchedAnimeId, {
        titleEnglish: candidate.titleEnglish,
        titleNative: candidate.titleNative,
        popularity: candidate.popularity,
        year: candidate.year,
        genres: candidate.genres,
      });
    }

    if (updates.size > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let index = 1;
      for (const [animeId, update] of updates) {
        placeholders.push(
          `($${index}, $${index + 1}::text, $${index + 2}::text, $${index + 3}::integer, $${index + 4}::integer, $${index + 5}::text[])`,
        );
        values.push(
          animeId,
          update.titleEnglish,
          update.titleNative,
          update.popularity,
          update.year,
          update.genres,
        );
        index += 6;
      }
      await pool.query(
        `
          update anime_catalog_anime as a set
            title_english = coalesce(v.title_english, a.title_english),
            title_native = coalesce(v.title_native, a.title_native),
            anilist_popularity = coalesce(v.anilist_popularity, a.anilist_popularity),
            year = coalesce(v.year, a.year),
            genres = case
              when coalesce(array_length(v.genres, 1), 0) > 0 then v.genres
              else a.genres
            end,
            updated_at = now()
          from (
            values ${placeholders.join(", ")}
          ) as v(id, title_english, title_native, anilist_popularity, year, genres)
          where a.id = v.id::bigint
        `,
        values,
      );
    }

    return animeIds;
  }

  private async buildAniListTrackPoolFromIds(session: RoomSession, safeRounds: number, animeIds: number[]) {
    const targetCandidateSize = this.targetAniListCandidatePoolSize(safeRounds);

    const themeCondition =
      session.themeMode === "op_only"
        ? "and tv.theme_type = 'OP'"
        : session.themeMode === "ed_only"
          ? "and tv.theme_type = 'ED'"
          : "";

    const rowLimit = Math.max(targetCandidateSize * 2, safeRounds + 24);
    const contentFilters = normalizeRoomContentFilters(session.contentFilters);
    const contentFilterSql = contentFilterSqlCondition(contentFilters, { startIndex: 3 });
    const needsPopularityMetadata = session.difficultyFilter !== "all";
    const needsYearMetadata = contentFilters.decades.length > 0;
    const needsGenresMetadata = contentFilters.genres.length > 0;
    const needsRoomFilterMetadata = needsPopularityMetadata || needsYearMetadata || needsGenresMetadata;
    const selectAniListRows = async (difficultyFilter: RoomDifficultyFilter) =>
      await pool.query<{
        anime_id: number;
        video_key: string;
        webm_url: string;
        theme_type: string;
        theme_number: number | null;
        title_romaji: string;
        title_english: string | null;
        song_title: string | null;
        song_artists: string[] | null;
        aliases: string[] | null;
      }>(
        `
          with best_theme_video as (
            select distinct on (tv.anime_id, tv.theme_type, coalesce(tv.theme_number, 0))
              aa.id as anime_id,
              tv.video_key,
              tv.webm_url,
              tv.theme_type,
              tv.theme_number,
              aa.title_romaji,
              aa.title_english,
              tv.song_title,
              tv.song_artists,
              (
                select array_agg(distinct al.alias)
                from anime_catalog_alias al
                where al.anime_id = tv.anime_id
              ) as aliases
            from anime_theme_videos tv
            join anime_catalog_anime aa on aa.id = tv.anime_id
            where tv.is_playable = true
              and tv.webm_url like 'https://v.animethemes.moe/%'
              and tv.anime_id = any($1::bigint[])
              ${themeCondition}
              ${difficultySqlCondition(difficultyFilter)}
              ${contentFilterSql.sql}
            order by
              tv.anime_id,
              tv.theme_type,
              coalesce(tv.theme_number, 0),
              tv.updated_at desc,
              tv.is_creditless desc,
              case
                when coalesce(tv.resolution, 0) = 720 then 0
                when coalesce(tv.resolution, 0) = 1080 then 1
                when coalesce(tv.resolution, 0) > 1080 then 2
                when coalesce(tv.resolution, 0) = 480 then 3
                when coalesce(tv.resolution, 0) > 0 then 4
                else 5
              end asc,
              coalesce(tv.resolution, 0) desc,
              tv.video_key desc
          )
          select anime_id, video_key, webm_url, theme_type, theme_number, title_romaji, title_english, song_title, song_artists, aliases
          from best_theme_video
          order by random()
          limit $2
        `,
        [animeIds, rowLimit, ...contentFilterSql.params],
      );

    const backfillAniListMetadata = async (limit: number, offset = 0) => {
      const missingPopularityRows = await pool.query<{
        anime_id: number;
        title_romaji: string;
      }>(
        `
          select a.id as anime_id, a.title_romaji
          from unnest($1::bigint[]) with ordinality as ids(id, ord)
          join anime_catalog_anime a on a.id = ids.id
          where (
            ($4::boolean and a.anilist_popularity is null)
            or ($5::boolean and a.year is null)
            or ($6::boolean and coalesce(array_length(a.genres, 1), 0) <= 0)
          )
          order by ids.ord asc
          limit $2
          offset $3
        `,
        [animeIds, limit, offset, needsPopularityMetadata, needsYearMetadata, needsGenresMetadata],
      );
      if (missingPopularityRows.rows.length <= 0) {
        return { attemptedCount: 0, updatedCount: 0 };
      }

      const updates: Array<{
        animeId: number;
        titleEnglish: string | null;
        popularity: number | null;
        year: number | null;
        genres: string[];
      }> = [];

      for (
        let index = 0;
        index < missingPopularityRows.rows.length;
        index += ANILIST_ENGLISH_BACKFILL_BATCH_SIZE
      ) {
        const batch = missingPopularityRows.rows.slice(index, index + ANILIST_ENGLISH_BACKFILL_BATCH_SIZE);
        const metadataByTitle = await fetchAniListMediaMetadataBySearchBatch(
          batch.map((row) => row.title_romaji),
        );
        for (const row of batch) {
          const metadata = metadataByTitle.get(row.title_romaji) ?? null;
          if (!metadata) continue;
          updates.push({
            animeId: row.anime_id,
            titleEnglish: metadata.englishTitle,
            popularity: metadata.popularity,
            year: metadata.year,
            genres: metadata.genres,
          });
        }
      }

      if (updates.length <= 0) {
        return {
          attemptedCount: missingPopularityRows.rows.length,
          updatedCount: 0,
        };
      }

      const values: unknown[] = [];
      const placeholders: string[] = [];
      let index = 1;
      for (const update of updates) {
        placeholders.push(
          `($${index}, $${index + 1}::text, $${index + 2}::integer, $${index + 3}::integer, $${index + 4}::text[])`,
        );
        values.push(update.animeId, update.titleEnglish, update.popularity, update.year, update.genres);
        index += 5;
      }
      await pool.query(
        `
          update anime_catalog_anime as a set
            title_english = coalesce(v.title_english, a.title_english),
            anilist_popularity = coalesce(v.anilist_popularity, a.anilist_popularity),
            year = coalesce(v.year, a.year),
            genres = case
              when coalesce(array_length(v.genres, 1), 0) > 0 then v.genres
              else a.genres
            end,
            updated_at = now()
          from (
            values ${placeholders.join(", ")}
          ) as v(id, title_english, anilist_popularity, year, genres)
          where a.id = v.id::bigint
        `,
        values,
      );

      return {
        attemptedCount: missingPopularityRows.rows.length,
        updatedCount: updates.filter((update) => update.popularity !== null).length,
      };
    };

    let selected = await selectAniListRows(session.difficultyFilter);
    const desiredFilteredRows = Math.min(rowLimit, Math.max(targetCandidateSize, safeRounds));
    if (needsRoomFilterMetadata && selected.rows.length < desiredFilteredRows) {
      const maxBackfillAttempts = Math.min(
        animeIds.length,
        Math.max(ANILIST_DIFFICULTY_START_BACKFILL_LIMIT, desiredFilteredRows * 2),
      );
      const backfill = await backfillAniListMetadata(maxBackfillAttempts);
      if (backfill.attemptedCount > 0) {
        selected = await selectAniListRows(session.difficultyFilter);
      }

      if (selected.rows.length < desiredFilteredRows) {
        logEvent("warn", "anilist_room_filter_metadata_incomplete", {
          roomCode: session.roomCode,
          difficultyFilter: session.difficultyFilter,
          contentFilters,
          requestedRounds: safeRounds,
          desiredFilteredRows,
          selectedRows: selected.rows.length,
          attemptedBackfills: backfill.attemptedCount,
          updatedBackfills: backfill.updatedCount,
          maxBackfillAttempts,
        });
      }
    }

    const englishTitleBackfills = new Map<number, string>();
    const missingEnglishRows = Array.from(
      new Map(
        selected.rows
          .filter((row) => (row.title_english?.trim() ?? "").length <= 0)
          .map((row) => [row.anime_id, row] as const),
      ).values(),
    );

    for (let index = 0; index < missingEnglishRows.length; index += ANILIST_ENGLISH_BACKFILL_BATCH_SIZE) {
        const batch = missingEnglishRows.slice(index, index + ANILIST_ENGLISH_BACKFILL_BATCH_SIZE);
        const metadataByTitle = await fetchAniListMediaMetadataBySearchBatch(
          batch.map((row) => row.title_romaji),
        );
      for (const row of batch) {
        const englishTitle = metadataByTitle.get(row.title_romaji)?.englishTitle;
        if (!englishTitle) continue;
        englishTitleBackfills.set(row.anime_id, englishTitle);
      }
    }

    if (englishTitleBackfills.size > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let index = 1;
      for (const [animeId, englishTitle] of englishTitleBackfills) {
        placeholders.push(`($${index}, $${index + 1}::text)`);
        values.push(animeId, englishTitle);
        index += 2;
      }
      await pool.query(
        `
          update anime_catalog_anime as a set
            title_english = v.title_english,
            updated_at = now()
          from (values ${placeholders.join(", ")}) as v(id, title_english)
          where a.id = v.id::bigint
            and coalesce(nullif(a.title_english, ''), '') = ''
        `,
        values,
      );
    }

    const uniqueRows = Array.from(
      new Map(selected.rows.map((row) => [row.anime_id, row] as const)).values(),
    );

    const tracks: MusicTrack[] = uniqueRows.map((row) => {
      const englishTitle = englishTitleBackfills.get(row.anime_id) ?? row.title_english;
      const themeLabel = `${row.theme_type}${row.theme_number ?? ""}`.trim();
      const answerAliases = Array.from(
        new Set(
          [englishTitle, ...(row.aliases ?? [])]
            .map((value) => value?.trim() ?? "")
            .filter((value) => value.length > 0),
        ),
      );
      const proxyUrl = animethemesProxyUrl(row.video_key);
      return {
        provider: "animethemes",
        id: row.video_key,
        title: row.title_romaji,
        artist: themeLabel.length > 0 ? themeLabel : row.theme_type,
        songTitle: row.song_title,
        songArtists: row.song_artists ?? [],
        previewUrl: proxyUrl,
        sourceUrl: proxyUrl,
        audioUrl: proxyUrl,
        videoUrl: proxyUrl,
        answer: {
          canonical: row.title_romaji,
          englishTitle,
          aliases: answerAliases,
        },
      } satisfies MusicTrack;
    });

    const candidateTracks = tracks.filter((track) => isTrackPlayable(track));
    console.log(
      `[RoomStore] AniList track pool: ${animeIds.length} anime IDs → ${selected.rows.length} raw → ${candidateTracks.length} playable (need ${safeRounds} rounds)`,
    );
    const split = this.splitAnswerAndDistractorPools(candidateTracks, safeRounds);
    return {
      tracks: split.tracks,
      distractorTracks: split.distractorTracks,
      candidateCount: split.candidateCount,
      rawTotal: selected.rows.length,
      playableTotal: candidateTracks.length,
      cleanTotal: candidateTracks.length,
    };
  }

  private stopPlayersLikedPoolJob(roomCode: string) {
    this.roomLikedPoolJobs.delete(roomCode);
  }

  private async buildPlayersLikedTrackPool(
    session: RoomSession,
    requestedRounds: number,
    options: { allowExternalResolve?: boolean; candidateSizeOverride?: number } = {},
  ) {
    const safeRounds = Math.max(1, requestedRounds);
    const allowExternalResolve = options.allowExternalResolve === true;
    const targetCandidateSize = Math.max(
      1,
      Math.min(
        TRACK_POOL_MAX_CANDIDATES,
        Math.floor(options.candidateSizeOverride ?? this.targetCandidatePoolSize(safeRounds)),
      ),
    );
    const contributors = this.playersLikedContributors(session);
    const mergedTracks: MusicTrack[] = [];
    const seen = new Set<string>();
    let fetchedTotal = 0;

    for (const contributor of contributors) {
      const providers: LibraryProvider[] = [];
      if (this.canUsePlayersLikedProvider(contributor, "spotify")) {
        providers.push("spotify");
      }
      if (this.canUsePlayersLikedProvider(contributor, "deezer")) {
        providers.push("deezer");
      }
      if (!contributor.userId || providers.length <= 0) continue;

      const fetched = await withTimeout(
        this.getPlayerLikedTracks({
          userId: contributor.userId,
          providers,
          size: targetCandidateSize,
          allowExternalResolve,
        }),
        PLAYERS_LIKED_POOL_BUILD_TIMEOUT_MS,
        "PLAYERS_LIBRARY_TIMEOUT",
      );
      fetchedTotal += fetched.length;

      for (const track of fetched) {
        if (looksLikePromotionalTrack(track)) continue;
        const key = trackSignature(track);
        if (seen.has(key)) continue;
        seen.add(key);
        mergedTracks.push(track);
      }
    }

    const playableTracks = mergedTracks.filter((track) => isTrackPlayable(track));
    const split = this.splitAnswerAndDistractorPools(playableTracks, safeRounds);
    const selectedAnswerKeys = new Set(split.tracks.map((track) => trackSignature(track)));
    const distractorTracks = randomShuffle(
      mergedTracks.filter((track) => !selectedAnswerKeys.has(trackSignature(track))),
    );
    return {
      tracks: split.tracks,
      distractorTracks,
      candidateCount: mergedTracks.length,
      fetchedTotal,
      playableTotal: playableTracks.length,
      cleanTotal: mergedTracks.length,
      contributorsCount: contributors.length,
    };
  }

  private async resolveTracksWithFlag<T>(session: RoomSession, task: () => Promise<T>) {
    session.trackResolutionJobsInFlight += 1;
    session.isResolvingTracks = true;
    try {
      return await task();
    } finally {
      session.trackResolutionJobsInFlight = Math.max(0, session.trackResolutionJobsInFlight - 1);
      session.isResolvingTracks = session.trackResolutionJobsInFlight > 0;
    }
  }

  private startPlayersLikedPoolBuild(session: RoomSession) {
    if (session.sourceMode !== "players_liked") return;
    if (this.roomLikedPoolJobs.has(session.roomCode)) {
      this.roomLikedPoolRebuildRequested.add(session.roomCode);
      return;
    }

    const roomCode = session.roomCode;
    const desiredSize = Math.max(session.playersLikedRules.minTotalTracks, this.config.maxRounds);
    this.roomLikedPoolRebuildRequested.delete(roomCode);
    session.poolBuild.status = "building";
    session.poolBuild.mergedTracksCount = 0;
    session.poolBuild.playableTracksCount = 0;
    session.poolBuild.errorCode = null;
    const buildJob = (async () => {
      await this.resolveTracksWithFlag(session, async () => {
        try {
          const built = await this.buildPlayersLikedTrackPool(session, desiredSize);
          if (session.sourceMode !== "players_liked") {
            return;
          }
          session.playersLikedPool = [...built.tracks, ...built.distractorTracks];
          session.poolBuild.status = built.tracks.length >= desiredSize ? "ready" : "failed";
          session.poolBuild.contributorsCount = built.contributorsCount;
          session.poolBuild.mergedTracksCount = built.playableTotal;
          session.poolBuild.playableTracksCount = built.candidateCount;
          session.poolBuild.lastBuiltAtMs = this.now();
          session.poolBuild.errorCode = built.tracks.length >= desiredSize ? null : "NO_TRACKS_FOUND";
        } catch (error) {
          session.playersLikedPool = [];
          session.poolBuild.status = "failed";
          session.poolBuild.contributorsCount = this.playersLikedContributors(session).length;
          session.poolBuild.mergedTracksCount = 0;
          session.poolBuild.playableTracksCount = 0;
          session.poolBuild.lastBuiltAtMs = this.now();
          session.poolBuild.errorCode = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        } finally {
          this.stopPlayersLikedPoolJob(roomCode);
          if (this.roomLikedPoolRebuildRequested.has(roomCode)) {
            this.roomLikedPoolRebuildRequested.delete(roomCode);
            const latest = this.rooms.get(roomCode);
            if (latest && latest.sourceMode === "players_liked" && latest.manager.state() === "waiting") {
              this.startPlayersLikedPoolBuild(latest);
            }
          }
        }
      });
    })();

    this.roomLikedPoolJobs.set(roomCode, buildJob);
  }

  private stopPreloadJob(roomCode: string) {
    this.roomPreloadJobs.delete(roomCode);
  }

  private refreshRoundPlan(session: RoomSession) {
    const plannedRounds = Math.min(session.trackPool.length, session.roomRoundConfig.maxRounds);
    session.totalRounds = plannedRounds;
    if (plannedRounds <= 0) {
      session.roundModes = [];
      return;
    }

    for (let round = session.roundModes.length + 1; round <= plannedRounds; round += 1) {
      session.roundModes.push(modeForRound(round, session.answerMode));
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
      const expected = normalizeAnswer(formatRoundChoiceLabel(track));
      return normalizeAnswer(answer) === expected;
    }

    const variants = collectAnswerVariants(track);
    return variants.some((candidate) => isTextAnswerCorrect(answer, candidate));
  }

  private isSpotifyRateLimitedRecently() {
    const spotify = providerMetricsSnapshot().spotify;
    if (!spotify || spotify.lastStatus !== 429) return false;
    const lastSeenAtMs = Date.parse(spotify.lastSeenAt);
    if (!Number.isFinite(lastSeenAtMs)) return true;
    return Date.now() - lastSeenAtMs <= 30_000;
  }

  private activePlayerIds(session: RoomSession) {
    return this.activePlayers(session).map((player) => player.id);
  }

  private trackForRound(session: RoomSession, round: number) {
    if (round <= 0) return null;
    return session.trackPool[round - 1] ?? null;
  }

  private loadingMsForRound(session: RoomSession, round: number) {
    const configured = Math.max(0, this.config.loadingMs);
    if (configured <= 0 || round <= 0) return 0;
    const track = this.trackForRound(session, round);
    if (!track || track.provider !== "animethemes") return 0;
    return configured;
  }

  private loadingMsForCurrentTransition(session: RoomSession) {
    const state = session.manager.state();
    let round = 0;
    if (state === "countdown") {
      round = 1;
    } else if (state === "leaderboard") {
      round = session.manager.round() + 1;
    } else if (state === "loading" || state === "playing" || state === "reveal") {
      round = session.manager.round();
    }
    return this.loadingMsForRound(session, round);
  }

  private warmAnimeThemesRoundTrack(session: RoomSession, round: number) {
    const track = this.trackForRound(session, round);
    if (!track || track.provider !== "animethemes" || !track.id) return;
    void this.warmAnimeThemeVideo(track.id).catch((error) => {
      logEvent("warn", "room_animethemes_warm_failed", {
        roomCode: session.roomCode,
        round,
        trackId: track.id,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    });
  }

  private warmUpcomingAnimeThemesTracks(session: RoomSession, currentRound: number) {
    const rounds = new Set([currentRound, currentRound + 1]);
    for (const round of rounds) {
      this.warmAnimeThemesRoundTrack(session, round);
    }
  }

  private isGuessPhaseDoneForAll(session: RoomSession) {
    const ids = this.activePlayerIds(session);
    if (ids.length <= 0) return false;
    return ids.every((playerId) => session.manager.hasGuessDone(playerId));
  }

  private isRevealSkipDoneForAll(session: RoomSession) {
    const ids = this.activePlayerIds(session);
    if (ids.length <= 0) return false;
    return ids.every((playerId) => session.manager.hasRevealSkipped(playerId));
  }

  private maybeAdvanceOnUnanimousPhaseCompletion(session: RoomSession, nowMs: number) {
    const state = session.manager.state();
    if (state === "playing" && this.isGuessPhaseDoneForAll(session)) {
      if (session.manager.expireCurrentPhase(nowMs)) {
        this.progressSession(session, nowMs);
      }
      return true;
    }
    if (state === "reveal" && this.isRevealSkipDoneForAll(session)) {
      if (session.manager.expireCurrentPhase(nowMs)) {
        this.progressSession(session, nowMs);
      }
      return true;
    }
    return false;
  }

  private syncRoundTimeline(session: RoomSession, nowMs: number) {
    const state = session.manager.state();
    const currentRound = session.manager.round();
    const roundContext = { roomCode: session.roomCode, round: currentRound };
    const currentTrack = currentRound > 0 ? this.trackForRound(session, currentRound) : null;
    const mediaOffsetSec = roundMediaOffsetSeconds(currentTrack, roundContext);

    if (state === "loading") {
      if (currentRound <= 0) return;
      if (session.roundSyncRound !== currentRound) {
        session.roundSync.prepareRound({
          nowMs,
          phaseToken: `${session.roomCode}:${currentRound}:${nowMs}`,
          playerIds: this.activePlayerIds(session),
          hostPlayerId: this.ensureHost(session),
          mediaOffsetSec,
        });
        this.warmUpcomingAnimeThemesTracks(session, currentRound);
        session.roundSyncRound = currentRound;
      } else {
        session.roundSync.refreshParticipants(
          this.activePlayerIds(session),
          this.ensureHost(session),
        );
      }
      return;
    }

    if (state === "playing") {
      if (currentRound <= 0) return;
      if (session.roundSyncRound !== currentRound) {
        session.roundSync.prepareRound({
          nowMs,
          phaseToken: `${session.roomCode}:${currentRound}:${nowMs}`,
          playerIds: this.activePlayerIds(session),
          hostPlayerId: this.ensureHost(session),
          mediaOffsetSec,
        });
        session.roundSyncRound = currentRound;
      }

      const snapshot = session.roundSync.snapshot();
      const startedAtMs = session.manager.startedAtMs() ?? nowMs;
      session.roundSync.markStarted(snapshot.plannedStartAtMs ?? startedAtMs);
      return;
    }

    if (session.roundSyncRound !== null || session.roundSync.snapshot().status !== "idle") {
      session.roundSync.reset();
      session.roundSyncRound = null;
    }
  }

  private maybeScheduleLoadingRoundStart(session: RoomSession, nowMs: number) {
    if (session.manager.state() !== "loading") return false;
    const snapshot = session.roundSync.snapshot();
    if (snapshot.status !== "preparing") return false;
    return session.roundSync.maybeScheduleStart(nowMs) !== null;
  }

  private maybeStartScheduledLoadingRound(session: RoomSession, nowMs: number) {
    if (session.manager.state() !== "loading") return false;
    const snapshot = session.roundSync.snapshot();
    if (snapshot.status !== "scheduled" || snapshot.plannedStartAtMs === null) {
      return false;
    }
    if (nowMs < snapshot.plannedStartAtMs) return false;
    session.roundSync.markStarted(snapshot.plannedStartAtMs);
    if (!session.manager.expireCurrentPhase(snapshot.plannedStartAtMs)) {
      return false;
    }
    return true;
  }

  private progressSession(session: RoomSession, nowMs: number) {
    this.maybeScheduleLoadingRoundStart(session, nowMs);
    if (this.maybeStartScheduledLoadingRound(session, nowMs)) {
      // Continue into the regular tick path so the loading phase flips to playing immediately.
    }

    const loadingMs = this.loadingMsForCurrentTransition(session);
    const tick = session.manager.tick({
      nowMs,
      loadingMs,
      roundMs: session.roomRoundConfig.playingMs,
      revealMs: session.roomRoundConfig.revealMs,
      leaderboardMs: this.config.leaderboardMs,
    });

    if (tick.closedRounds.length > 0) {
      for (const closedRound of tick.closedRounds) {
        this.applyRoundResults(session, closedRound);
      }
    }

    this.syncRoundTimeline(session, nowMs);
  }

  private applyRoundResults(session: RoomSession, round: ClosedRound) {
    const track = session.trackPool[round.round - 1] ?? null;
    const roundMode = session.roundModes[round.round - 1] ?? "text";
    const roundChoices =
      roundMode === "mcq" ? this.buildRoundChoices(session, round.round) : null;
    const playerRoundResults = new Map<
      string,
      { answer: string | null; submitted: boolean; isCorrect: boolean }
    >();

    for (const player of session.players.values()) {
      if (this.isPlayerSpectating(session, player)) {
        player.lastRoundScore = 0;
        playerRoundResults.set(player.id, {
          answer: null,
          submitted: false,
          isCorrect: false,
        });
        continue;
      }

      const submitted = round.answers.get(player.id);
      const isCorrect = submitted ? this.isAnswerCorrect(roundMode, submitted.value, track) : false;
      const responseMs =
        submitted && isCorrect ? Math.max(0, submitted.submittedAtMs - round.startedAtMs) : 0;
      const trimmedAnswer = submitted?.value.trim() ?? "";
      const scoring = applyScore({
        isCorrect,
        responseMs,
        streak: player.streak,
        baseScore: this.config.baseScore,
      });

      player.score += scoring.earned;
      player.lastRoundScore = scoring.earned;
      player.streak = scoring.nextStreak;
      player.maxStreak = Math.max(player.maxStreak, player.streak);

      if (isCorrect) {
        player.correctAnswers += 1;
        player.totalResponseMs += responseMs;
      } else if (session.livesMode) {
        player.lives = Math.max(0, player.lives - 1);
        if (player.lives <= 0) {
          player.isEliminated = true;
        }
      }

      playerRoundResults.set(player.id, {
        answer: trimmedAnswer.length > 0 ? trimmedAnswer : null,
        submitted: Boolean(submitted),
        isCorrect,
      });
    }

    if (track) {
      scheduleRomanizeJapanese(track.title);
      scheduleRomanizeJapanese(track.artist);
    }

    const revealAnswers = this.sortedPlayers(session).map((player) => {
      const result = playerRoundResults.get(player.id);
      return {
        playerId: player.id,
        displayName: player.displayName,
        answer: result?.answer ?? null,
        submitted: result?.submitted ?? false,
        isCorrect: result?.isCorrect ?? false,
      };
    });

    session.latestReveal = track
      ? {
          round: round.round,
          trackId: track.id,
          title: track.title,
          titleRomaji: getRomanizedJapaneseCached(track.title),
          titleEnglish: formatEnglishTitleForTrack(track),
          artist: track.artist,
          artistRomaji: getRomanizedJapaneseCached(track.artist),
          songTitle: track.songTitle ?? null,
          songArtists: track.songArtists ?? [],
          provider: track.provider,
          mode: roundMode,
          acceptedAnswer: formatRoundChoiceLabel(track),
          previewUrl: track.previewUrl,
          sourceUrl: track.sourceUrl,
          embedUrl: embedUrlForTrack(track, { roomCode: session.roomCode, round: round.round }),
          choices: roundChoices,
          playerAnswers: revealAnswers,
        }
      : null;

    const activePlayerCount = this.activePlayers(session).length;
    if (
      session.livesMode &&
      (activePlayerCount <= 0 || (session.players.size > 1 && activePlayerCount === 1))
    ) {
      session.totalRounds = Math.min(session.totalRounds, round.round);
      session.manager.setTotalRounds(session.totalRounds);
    }
  }

  createRoom(options: { isPublic?: boolean; categoryQuery?: string } = {}) {
    const nowMs = this.now();
    let roomCode = randomRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = randomRoomCode();
    }

    const requestedCategory = options.categoryQuery?.trim() ?? "";
    const lowerCategory = requestedCategory.toLowerCase();
    const initialSourceMode: RoomSourceMode =
      lowerCategory.startsWith("deezer:playlist:")
        ? "public_playlist"
        : lowerCategory === "players:liked"
          ? "players_liked"
          : "anilist_union";
    const initialCategoryQuery =
      initialSourceMode === "anilist_union"
        ? "anilist:linked:union"
        : requestedCategory;

    const session: RoomSession = {
      roomCode,
      createdAtMs: nowMs,
      isPublic: options.isPublic ?? true,
      manager: new RoomManager(roomCode),
      roundSync: new RoundSyncCoordinator({
        startLeadMs: ROUND_SYNC_START_LEAD_MS,
        maxWaitMs: ROUND_SYNC_MAX_WAIT_MS,
      }),
      roundSyncRound: null,
      players: new Map(),
      hostPlayerId: null,
      nextPlayerNumber: 1,
      trackPool: [],
      distractorTrackPool: [],
      sourceMode: initialSourceMode,
      themeMode: "mix",
      difficultyFilter: "all",
      contentFilters: defaultRoomContentFilters(),
      answerMode: "mixed",
      livesMode: false,
      maxLives: DEFAULT_MAX_LIVES,
      roomRoundConfig: {
        maxRounds: this.config.maxRounds,
        playingMs: this.config.playingMs,
        revealMs: this.config.revealMs,
      },
      publicPlaylistSelection: null,
      playersLikedRules: {
        minContributors: 1,
        minTotalTracks: 1,
      },
      playersLikedPool: [],
      poolBuild: {
        status: "idle",
        contributorsCount: 0,
        mergedTracksCount: 0,
        playableTracksCount: 0,
        lastBuiltAtMs: null,
        errorCode: null,
      },
      isResolvingTracks: false,
      trackResolutionJobsInFlight: 0,
      categoryQuery: initialCategoryQuery,
      totalRounds: 0,
      roundModes: [],
      roundChoices: new Map(),
      latestReveal: null,
      chatMessages: [],
    };
    if (session.sourceMode === "public_playlist" && session.categoryQuery.toLowerCase().startsWith("deezer:playlist:")) {
      session.publicPlaylistSelection = {
        provider: "deezer",
        id: session.categoryQuery.slice("deezer:playlist:".length),
        name: session.categoryQuery,
        trackCount: null,
        sourceQuery: session.categoryQuery,
        selectedByPlayerId: "system",
      };
    }

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
      lastRoundScore: 0,
      streak: 0,
      maxStreak: 0,
      totalResponseMs: 0,
      correctAnswers: 0,
      lives: DEFAULT_MAX_LIVES,
      isEliminated: false,
      library: defaultPlayerLibraryState(),
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

  joinRoomAsUser(
    roomCode: string,
    displayName: string,
    userId: string | null,
    linkedProviders?: Partial<Record<LibraryProvider, { status: ProviderLinkStatus; estimatedTrackCount: number | null }>>,
  ) {
    const joined = this.joinRoom(roomCode, displayName);
    if (joined.status !== "ok") return joined;

    const session = this.rooms.get(roomCode);
    const player = session?.players.get(joined.value.playerId);
    if (player) {
      player.userId = userId;
      if (linkedProviders) {
        for (const provider of ["spotify", "deezer"] as const) {
          const entry = linkedProviders[provider];
          if (!entry) continue;
          player.library.linkedProviders[provider] = normalizeProviderLinkStatus(entry.status);
          player.library.estimatedTrackCount[provider] =
            typeof entry.estimatedTrackCount === "number" && Number.isFinite(entry.estimatedTrackCount)
              ? Math.max(0, Math.floor(entry.estimatedTrackCount))
              : null;
          player.library.includeInPool[provider] =
            player.library.linkedProviders[provider] === "linked" || this.hasSyncedLibraryTracks(player, provider);
        }
        player.library.syncStatus = "ready";
      }
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

    session.sourceMode = "public_playlist";
    if (normalized.toLowerCase().startsWith("deezer:playlist:")) {
      const id = normalized.slice("deezer:playlist:".length).trim();
      session.publicPlaylistSelection = {
        provider: "deezer",
        id,
        name: normalized,
        trackCount: null,
        sourceQuery: normalized,
        selectedByPlayerId: playerId,
      };
    } else {
      session.publicPlaylistSelection = null;
    }
    session.playersLikedPool = [];
    session.distractorTrackPool = [];
    this.roomLikedPoolRebuildRequested.delete(roomCode);
    session.poolBuild = {
      status: "idle",
      contributorsCount: 0,
      mergedTracksCount: 0,
      playableTracksCount: 0,
      lastBuiltAtMs: null,
      errorCode: null,
    };
    session.isResolvingTracks = false;
    session.trackResolutionJobsInFlight = 0;
    session.categoryQuery = normalized;
    this.resetReadyStates(session);
    return { status: "ok" as const, categoryQuery: normalized };
  }

  setRoomSourceMode(roomCode: string, playerId: string, mode: RoomSourceMode) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    session.sourceMode = mode;
    if (mode === "public_playlist") {
      session.playersLikedPool = [];
      session.trackPool = [];
      session.distractorTrackPool = [];
      this.roomLikedPoolRebuildRequested.delete(roomCode);
      session.poolBuild = {
        status: "idle",
        contributorsCount: 0,
        mergedTracksCount: 0,
        playableTracksCount: 0,
        lastBuiltAtMs: null,
        errorCode: null,
      };
      session.isResolvingTracks = false;
      session.trackResolutionJobsInFlight = 0;
      if (session.publicPlaylistSelection?.sourceQuery) {
        session.categoryQuery = session.publicPlaylistSelection.sourceQuery;
      } else if (session.categoryQuery === "players:liked") {
        session.categoryQuery = "";
      }
    } else if (isLegacyPlayersLikedSource(mode)) {
      session.publicPlaylistSelection = null;
      session.trackPool = [];
      session.distractorTrackPool = [];
      session.categoryQuery = "players:liked";
      for (const player of session.players.values()) {
        for (const provider of ["spotify", "deezer"] as const) {
          if (player.library.linkedProviders[provider] === "linked" || this.hasSyncedLibraryTracks(player, provider)) {
            player.library.includeInPool[provider] = true;
          }
        }
      }
    } else if (isRandomClassicSource(mode)) {
      session.publicPlaylistSelection = null;
      session.playersLikedPool = [];
      session.distractorTrackPool = [];
      session.trackPool = [];
      this.roomLikedPoolRebuildRequested.delete(roomCode);
      session.poolBuild = {
        status: "idle",
        contributorsCount: 0,
        mergedTracksCount: 0,
        playableTracksCount: 0,
        lastBuiltAtMs: null,
        errorCode: null,
      };
      session.isResolvingTracks = false;
      session.trackResolutionJobsInFlight = 0;
      session.categoryQuery = "anilist:random:classic";
    } else {
      session.publicPlaylistSelection = null;
      session.playersLikedPool = [];
      session.trackPool = [];
      session.distractorTrackPool = [];
      this.roomLikedPoolRebuildRequested.delete(roomCode);
      session.poolBuild = {
        status: "idle",
        contributorsCount: 0,
        mergedTracksCount: 0,
        playableTracksCount: 0,
        lastBuiltAtMs: null,
        errorCode: null,
      };
      session.isResolvingTracks = false;
      session.trackResolutionJobsInFlight = 0;
      session.categoryQuery = "anilist:linked:union";
    }
    this.resetReadyStates(session);
    return { status: "ok" as const, mode: session.sourceMode };
  }

  setRoomThemeMode(roomCode: string, playerId: string, mode: RoomThemeMode) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    session.themeMode = mode;
    this.resetReadyStates(session);
    return { status: "ok" as const, mode: session.themeMode };
  }

  setRoomDifficultyFilter(roomCode: string, playerId: string, filter: RoomDifficultyFilter) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    session.difficultyFilter = filter;
    this.resetReadyStates(session);
    return { status: "ok" as const, filter: session.difficultyFilter };
  }

  setRoomContentFilters(
    roomCode: string,
    playerId: string,
    contentFilters: Partial<RoomContentFilters>,
  ) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    session.contentFilters = normalizeRoomContentFilters(contentFilters);
    this.resetReadyStates(session);
    return { status: "ok" as const, contentFilters: session.contentFilters };
  }

  setRoomLivesMode(
    roomCode: string,
    playerId: string,
    config: { livesMode?: boolean; maxLives?: number },
  ) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    if (typeof config.livesMode === "boolean") {
      session.livesMode = config.livesMode;
    }
    if (typeof config.maxLives === "number" && Number.isFinite(config.maxLives)) {
      session.maxLives = Math.max(1, Math.min(10, Math.floor(config.maxLives)));
    }
    if (!session.livesMode) {
      session.maxLives = Math.max(1, session.maxLives);
    }
    for (const player of session.players.values()) {
      player.lives = session.maxLives;
      player.isEliminated = false;
    }
    this.resetReadyStates(session);
    return {
      status: "ok" as const,
      livesMode: session.livesMode,
      maxLives: session.maxLives,
    };
  }

  setRoomRoundConfig(
    roomCode: string,
    playerId: string,
    config: { maxRounds?: number; playingMs?: number; revealMs?: number },
  ) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    if (typeof config.maxRounds === "number") {
      session.roomRoundConfig.maxRounds = Math.max(1, Math.min(50, config.maxRounds));
    }
    if (typeof config.playingMs === "number") {
      session.roomRoundConfig.playingMs = Math.max(5_000, Math.min(60_000, config.playingMs));
    }
    if (typeof config.revealMs === "number") {
      session.roomRoundConfig.revealMs = Math.max(3_000, Math.min(30_000, config.revealMs));
    }

    this.resetReadyStates(session);
    return { status: "ok" as const, config: session.roomRoundConfig };
  }

  setRoomAnswerMode(roomCode: string, playerId: string, mode: RoomAnswerMode) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };

    session.answerMode = mode;
    this.resetReadyStates(session);
    return { status: "ok" as const, mode: session.answerMode };
  }

  setRoomPublicPlaylist(
    roomCode: string,
    playerId: string,
    selection: { id: string; name: string; trackCount: number | null; sourceQuery?: string },
  ) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    this.ensureHost(session);
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };
    if (session.hostPlayerId !== playerId) return { status: "forbidden" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };
    const id = selection.id.trim();
    if (id.length <= 0) return { status: "invalid_payload" as const };

    const sourceQuery = selection.sourceQuery?.trim().length
      ? selection.sourceQuery.trim()
      : `deezer:playlist:${id}`;
    session.sourceMode = "public_playlist";
    session.publicPlaylistSelection = {
      provider: "deezer",
      id,
      name: selection.name.trim().length > 0 ? selection.name.trim() : id,
      trackCount:
        typeof selection.trackCount === "number" && Number.isFinite(selection.trackCount)
          ? Math.max(0, Math.floor(selection.trackCount))
          : null,
      sourceQuery,
      selectedByPlayerId: playerId,
    };
    session.playersLikedPool = [];
    session.distractorTrackPool = [];
    this.roomLikedPoolRebuildRequested.delete(roomCode);
    session.poolBuild = {
      status: "idle",
      contributorsCount: 0,
      mergedTracksCount: 0,
      playableTracksCount: 0,
      lastBuiltAtMs: null,
      errorCode: null,
    };
    session.isResolvingTracks = false;
    session.trackResolutionJobsInFlight = 0;
    session.categoryQuery = sourceQuery;
    this.resetReadyStates(session);
    return {
      status: "ok" as const,
      categoryQuery: session.categoryQuery,
      sourceMode: session.sourceMode,
    };
  }

  setPlayerLibraryContribution(
    roomCode: string,
    playerId: string,
    provider: LibraryProvider,
    includeInPool: boolean,
  ) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    if (session.manager.state() !== "waiting") return { status: "invalid_state" as const };
    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };
    if (!player.userId) return { status: "forbidden" as const };

    player.library.includeInPool[provider] = includeInPool;
    if (session.sourceMode === "players_liked") {
      session.poolBuild.status = "idle";
      session.poolBuild.mergedTracksCount = 0;
      session.poolBuild.playableTracksCount = 0;
      session.poolBuild.errorCode = null;
    }
    this.resetReadyStates(session);
    return {
      status: "ok" as const,
      includeInPool: player.library.includeInPool[provider],
    };
  }

  setPlayerLibraryLinks(
    roomCode: string,
    playerId: string,
    links: Partial<Record<LibraryProvider, { status: ProviderLinkStatus; estimatedTrackCount: number | null }>>,
  ) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };

    player.library.syncStatus = "ready";
    player.library.lastError = null;
    for (const provider of ["spotify", "deezer"] as const) {
      const next = links[provider];
      if (!next) continue;
      player.library.linkedProviders[provider] = normalizeProviderLinkStatus(next.status);
      player.library.estimatedTrackCount[provider] =
        typeof next.estimatedTrackCount === "number" && Number.isFinite(next.estimatedTrackCount)
          ? Math.max(0, Math.floor(next.estimatedTrackCount))
          : null;
      player.library.includeInPool[provider] =
        player.library.linkedProviders[provider] === "linked" || this.hasSyncedLibraryTracks(player, provider);
    }

    if (session.sourceMode === "players_liked") {
      session.poolBuild.status = "idle";
      session.poolBuild.mergedTracksCount = 0;
      session.poolBuild.playableTracksCount = 0;
      session.poolBuild.errorCode = null;
    }

    return {
      status: "ok" as const,
      linkedProviders: {
        spotify: player.library.linkedProviders.spotify,
        deezer: player.library.linkedProviders.deezer,
      },
    };
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
      this.stopPlayersLikedPoolJob(roomCode);
      this.roomLikedPoolRebuildRequested.delete(roomCode);
      this.rooms.delete(roomCode);
      return { status: "ok" as const, playerCount: 0, hostPlayerId: null };
    }
    this.ensureHost(session);
    if (session.manager.state() === "waiting") {
      this.resetReadyStates(session);
    } else {
      const nowMs = this.now();
      this.progressSession(session, nowMs);
      this.maybeAdvanceOnUnanimousPhaseCompletion(session, nowMs);
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
    this.stopPlayersLikedPoolJob(roomCode);
    this.roomLikedPoolRebuildRequested.delete(roomCode);
    session.manager.resetToWaiting();
    session.roundSync.reset();
    session.roundSyncRound = null;
    session.trackPool = [];
    session.distractorTrackPool = [];
    session.totalRounds = 0;
    session.roundModes = [];
    session.roundChoices.clear();
    session.latestReveal = null;
    session.chatMessages = [];
    session.playersLikedPool = [];
    session.poolBuild = {
      status: "idle",
      contributorsCount: 0,
      mergedTracksCount: 0,
      playableTracksCount: 0,
      lastBuiltAtMs: null,
      errorCode: null,
    };
    session.isResolvingTracks = false;
    session.trackResolutionJobsInFlight = 0;
    this.resetReadyStates(session);

    for (const player of session.players.values()) {
      player.score = 0;
      player.lastRoundScore = 0;
      player.streak = 0;
      player.maxStreak = 0;
      player.totalResponseMs = 0;
      player.correctAnswers = 0;
      player.lives = session.maxLives;
      player.isEliminated = false;
      player.library.includeInPool.spotify =
        player.library.linkedProviders.spotify === "linked" || this.hasSyncedLibraryTracks(player, "spotify");
      player.library.includeInPool.deezer =
        player.library.linkedProviders.deezer === "linked" || this.hasSyncedLibraryTracks(player, "deezer");
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
    const poolSize = Math.max(1, session.roomRoundConfig.maxRounds);
    if (session.sourceMode === "public_playlist") {
      const sourceQuery = this.sourceQueryForSession(session);
      if (sourceQuery.length <= 0) {
        return {
          ok: false as const,
          error: "SOURCE_NOT_SET" as const,
        };
      }
    } else if (isAniListUnionSource(session.sourceMode)) {
      const hasLinkedUser = [...session.players.values()].some((player) => player.userId !== null);
      if (!hasLinkedUser) {
        return {
          ok: false as const,
          error: "PLAYERS_LIBRARY_NOT_READY" as const,
        };
      }
    } else if (isRandomClassicSource(session.sourceMode)) {
      // random_classic does not require linked players — no validation needed here
    } else {
      const contributors = this.playersLikedContributors(session);
      if (contributors.length < session.playersLikedRules.minContributors) {
        return {
          ok: false as const,
          error: "PLAYERS_LIBRARY_NOT_READY" as const,
        };
      }
      if (session.poolBuild.status === "idle" || session.poolBuild.status === "failed") {
        this.startPlayersLikedPoolBuild(session);
      }
      if (session.poolBuild.status === "building") {
        const waitDeadlineMs = Date.now() + 12_000;
        while (session.poolBuild.status === "building") {
          const inFlight = this.roomLikedPoolJobs.get(roomCode);
          if (!inFlight) break;
          const remainingMs = waitDeadlineMs - Date.now();
          if (remainingMs <= 0) break;
          try {
            await withTimeout(inFlight, remainingMs, "PLAYERS_LIBRARY_SYNC_TIMEOUT");
          } catch {
            // Keep fallback error below when queued jobs do not finish in time.
            break;
          }
        }
        if (session.poolBuild.status === "building") {
          return {
            ok: false as const,
            error: "PLAYERS_LIBRARY_SYNCING" as const,
            retryAfterMs: 1_500,
          };
        }
      }
    }
    const resolvedQuery = this.sourceQueryForSession(session);
    const isDeezerPlaylistSource =
      session.sourceMode === "public_playlist" && resolvedQuery.toLowerCase().startsWith("deezer:playlist:");
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
      distractorTracks: MusicTrack[];
      candidateCount: number;
      rawTotal: number;
      playableTotal: number;
      cleanTotal: number;
    };
    const reusablePlayersLikedPlayablePool = isLegacyPlayersLikedSource(session.sourceMode)
      ? session.playersLikedPool.filter((track) => isTrackPlayable(track))
      : [];
    const canReusePlayersLikedPool = isLegacyPlayersLikedSource(session.sourceMode)
      && session.poolBuild.status === "ready"
      && reusablePlayersLikedPlayablePool.length >= poolSize;

    if (canReusePlayersLikedPool) {
      const split = this.splitAnswerAndDistractorPools(reusablePlayersLikedPlayablePool, poolSize);
      const answerSignatures = new Set(split.tracks.map((track) => trackSignature(track)));
      const distractorTracks = randomShuffle(
        session.playersLikedPool.filter((track) => !answerSignatures.has(trackSignature(track))),
      );
      startPoolStats = {
        tracks: split.tracks,
        distractorTracks,
        candidateCount: session.playersLikedPool.length,
        rawTotal: session.playersLikedPool.length,
        playableTotal: split.candidateCount,
        cleanTotal: session.playersLikedPool.length,
      };
      logEvent("info", "room_start_trackpool_reused_prebuilt", {
        roomCode,
        categoryQuery: resolvedQuery,
        startupPoolSize: poolSize,
        requestedRounds: poolSize,
        candidatePoolSize: session.playersLikedPool.length,
        playablePoolSize: split.candidateCount,
      });
    } else if (isLegacyPlayersLikedSource(session.sourceMode)) {
      if (session.manager.state() === "waiting" && session.poolBuild.status !== "building") {
        this.startPlayersLikedPoolBuild(session);
      }
      return {
        ok: false as const,
        error: "PLAYERS_LIBRARY_SYNCING" as const,
        retryAfterMs: 1_500,
      };
    } else if (isAniListUnionSource(session.sourceMode)) {
      startPoolStats = await this.resolveTracksWithFlag(
        session,
        async () => await this.buildAniListUnionTrackPool(session, poolSize),
      );
    } else if (isRandomClassicSource(session.sourceMode)) {
      try {
        startPoolStats = await this.resolveTracksWithFlag(
          session,
          async () => await this.buildRandomClassicTrackPool(session, poolSize),
        );
      } catch (error) {
        if (error instanceof AniListRemoteFailureError) {
          logEvent("warn", "room_start_anilist_remote_failure", {
            roomCode,
            requestedRounds: poolSize,
            failedFetchCount: error.failedFetchCount,
          });
          return {
            ok: false as const,
            error: "ANILIST_REMOTE_FAILURE" as const,
          };
        }
        throw error;
      }
    } else {
      try {
        startPoolStats = await this.resolveTracksWithFlag(
          session,
          async () => await this.buildStartTrackPool(resolvedQuery, poolSize),
        );
        for (
          let retryAttempt = 2;
          startPoolStats.tracks.length < poolSize && retryAttempt <= START_POOL_RETRY_ATTEMPTS;
          retryAttempt += 1
        ) {
          await sleepMs(START_POOL_RETRY_DELAY_MS);
          logEvent("info", "room_start_trackpool_retry", {
            roomCode,
            categoryQuery: resolvedQuery,
            requestedRounds: poolSize,
            retryAttempt,
            selectedPoolSize: startPoolStats.tracks.length,
            candidatePoolSize: startPoolStats.candidateCount,
          });
          startPoolStats = await this.resolveTracksWithFlag(
            session,
            async () => await this.buildStartTrackPool(resolvedQuery, poolSize),
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        if (errorMessage === SPOTIFY_RATE_LIMITED_ERROR) {
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
          error: errorMessage,
          youtubeProviderMetrics: providerMetricsSnapshot().youtube ?? null,
          spotifyProviderMetrics: providerMetricsSnapshot().spotify ?? null,
        });

        if (
          session.sourceMode === "players_liked" &&
          (errorMessage === "PLAYERS_LIBRARY_TIMEOUT" || errorMessage === "PLAYERS_LIBRARY_SYNC_TIMEOUT")
        ) {
          if (session.manager.state() === "waiting" && session.poolBuild.status !== "building") {
            this.startPlayersLikedPoolBuild(session);
          }
          return {
            ok: false as const,
            error: "PLAYERS_LIBRARY_SYNCING" as const,
            retryAfterMs: 1_500,
          };
        }

        if (isDeezerPlaylistSource) {
          return {
            ok: false as const,
            error: "PLAYLIST_TRACKS_RESOLVING" as const,
            retryAfterMs: 1_500,
          };
        }

        return {
          ok: false as const,
          error: "NO_TRACKS_FOUND" as const,
        };
      }
    }

    if (session.sourceMode === "players_liked" && session.playersLikedPool.length > 0) {
      const answerSignatures = new Set(startPoolStats.tracks.map((track) => trackSignature(track)));
      const mergedDistractorCandidates = [
        ...startPoolStats.distractorTracks,
        ...session.playersLikedPool,
      ];
      const mergedDistractors: MusicTrack[] = [];
      const seenDistractors = new Set<string>();
      for (const track of randomShuffle(mergedDistractorCandidates)) {
        const signature = trackSignature(track);
        if (answerSignatures.has(signature)) continue;
        if (seenDistractors.has(signature)) continue;
        seenDistractors.add(signature);
        mergedDistractors.push(track);
      }
      startPoolStats.distractorTracks = mergedDistractors;
      startPoolStats.candidateCount = Math.max(
        startPoolStats.candidateCount,
        startPoolStats.tracks.length + mergedDistractors.length,
      );
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
      distractorPoolSize: startPoolStats.distractorTracks.length,
      candidatePoolSize: startPoolStats.candidateCount,
    });

    session.trackPool = startPoolStats.tracks;
    session.distractorTrackPool = startPoolStats.distractorTracks;
    if (session.sourceMode === "players_liked") {
      session.playersLikedPool = [...startPoolStats.tracks, ...startPoolStats.distractorTracks];
      session.poolBuild.status = startPoolStats.tracks.length >= poolSize ? "ready" : "failed";
      session.poolBuild.contributorsCount = this.playersLikedContributors(session).length;
      session.poolBuild.mergedTracksCount = startPoolStats.playableTotal;
      session.poolBuild.playableTracksCount = startPoolStats.candidateCount;
      session.poolBuild.lastBuiltAtMs = this.now();
      session.poolBuild.errorCode = startPoolStats.tracks.length >= poolSize ? null : "NO_TRACKS_FOUND";
    }
    session.latestReveal = null;
    this.refreshRoundPlan(session);

    if (session.totalRounds < poolSize || session.trackPool.length < poolSize) {
      if (
        session.sourceMode === "public_playlist" &&
        resolvedQuery.toLowerCase().startsWith("spotify:") &&
        this.isSpotifyRateLimitedRecently()
      ) {
        return {
          ok: false as const,
          error: "SPOTIFY_RATE_LIMITED" as const,
          retryAfterMs: spotifyPlaylistRateLimitRetryAfterMs(),
        };
      }

      if (isDeezerPlaylistSource) {
        logEvent("info", "room_start_deezer_playlist_still_resolving", {
          roomCode,
          categoryQuery: resolvedQuery,
          requestedPoolSize: poolSize,
          selectedPoolSize: session.trackPool.length,
          candidatePoolSize: startPoolStats.candidateCount,
          retryAfterMs: 1_500,
        });
        return {
          ok: false as const,
          error: "PLAYLIST_TRACKS_RESOLVING" as const,
          retryAfterMs: 1_500,
        };
      }

      logEvent("warn", "room_start_no_tracks", {
        roomCode,
        categoryQuery: resolvedQuery,
        reason: "EMPTY_POOL",
        requestedPoolSize: poolSize,
        selectedPoolSize: session.trackPool.length,
        distractorPoolSize: session.distractorTrackPool.length,
        candidatePoolSize: startPoolStats.candidateCount,
        missingTracks: Math.max(0, poolSize - session.trackPool.length),
        preparedRounds: session.totalRounds,
        rawTrackPoolSize: startPoolStats.rawTotal,
        playablePoolSize: startPoolStats.playableTotal,
        cleanPoolSize: startPoolStats.cleanTotal,
        youtubeProviderMetrics: providerMetricsSnapshot().youtube ?? null,
        spotifyProviderMetrics: providerMetricsSnapshot().spotify ?? null,
        players: session.players.size,
      });
      return {
        ok: false as const,
        error: "NO_TRACKS_FOUND" as const,
      };
    }

    session.roundChoices.clear();
    for (let round = 1; round <= session.totalRounds; round += 1) {
      if (session.roundModes[round - 1] !== "mcq") continue;
      const roundChoices = this.buildRoundChoices(session, round);
      if (roundChoices.length >= MCQ_REQUIRED_CHOICES) continue;
      session.roundModes[round - 1] = "text";
      session.roundChoices.delete(round);
      logEvent("info", "room_start_round_mode_adjusted", {
        roomCode,
        categoryQuery: resolvedQuery,
        round,
        fromMode: "mcq",
        toMode: "text",
        choiceCount: roundChoices.length,
      });
    }
    for (const track of session.trackPool) {
      scheduleRomanizeJapanese(track.title);
      scheduleRomanizeJapanese(track.artist);
    }

    for (const player of session.players.values()) {
      player.score = 0;
      player.lastRoundScore = 0;
      player.streak = 0;
      player.maxStreak = 0;
      player.totalResponseMs = 0;
      player.correctAnswers = 0;
      player.lives = session.maxLives;
      player.isEliminated = false;
      player.isReady = false;
    }

    const tracksWithPreview = session.trackPool.filter((track) => hasAudioPreview(track)).length;
    const tracksWithYouTube = session.trackPool.filter((track) => hasYouTubePlayback(track)).length;
    logEvent("info", "room_start_audio_preview_coverage", {
      roomCode,
      categoryQuery: resolvedQuery,
      poolSize: session.trackPool.length,
      distractorPoolSize: session.distractorTrackPool.length,
      candidatePoolSize: startPoolStats.candidateCount,
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
      sourceMode: session.sourceMode,
      totalRounds: session.totalRounds,
      deadlineMs: session.manager.deadlineMs(),
    };
  }

  skipCurrentRound(roomCode: string, playerId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };

    const nowMs = this.now();
    this.progressSession(session, nowMs);
    const state = session.manager.state();
    if (state === "playing") {
      if (this.isPlayerSpectating(session, player)) {
        return {
          status: "ok" as const,
          accepted: false,
          state,
          round: session.manager.round(),
          deadlineMs: session.manager.deadlineMs(),
        };
      }
      const result = session.manager.skipGuessForPlayer(playerId, nowMs);
      if (result.accepted) {
        this.maybeAdvanceOnUnanimousPhaseCompletion(session, nowMs);
      }
      return {
        status: "ok" as const,
        accepted: result.accepted,
        state: session.manager.state(),
        round: session.manager.round(),
        deadlineMs: session.manager.deadlineMs(),
      };
    }
    if (state === "reveal") {
      if (this.isPlayerSpectating(session, player)) {
        return {
          status: "ok" as const,
          accepted: false,
          state,
          round: session.manager.round(),
          deadlineMs: session.manager.deadlineMs(),
        };
      }
      const result = session.manager.skipRevealForPlayer(playerId, nowMs);
      if (result.accepted) {
        this.maybeAdvanceOnUnanimousPhaseCompletion(session, nowMs);
      }
      return {
        status: "ok" as const,
        accepted: result.accepted,
        state: session.manager.state(),
        round: session.manager.round(),
        deadlineMs: session.manager.deadlineMs(),
      };
    }

    return { status: "invalid_state" as const };
  }

  async reportMediaUnavailable(roomCode: string, playerId: string, trackId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    if (!session.players.has(playerId)) return { status: "player_not_found" as const };

    const nowMs = this.now();
    this.progressSession(session, nowMs);
    const state = session.manager.state();
    if (state !== "loading" && state !== "playing" && state !== "reveal" && state !== "leaderboard") {
      return { status: "invalid_state" as const };
    }

    const currentRound = session.manager.round();
    const playingTrack = currentRound > 0 ? session.trackPool[currentRound - 1] ?? null : null;
    const revealTrack = session.latestReveal;
    const activeTrack = state === "playing" || state === "loading" ? playingTrack : revealTrack;
    if (!activeTrack || activeTrack.provider !== "animethemes") {
      return {
        status: "ok" as const,
        accepted: false,
        state: session.manager.state(),
        round: session.manager.round(),
        deadlineMs: session.manager.deadlineMs(),
      };
    }
    if (activeTrack.id !== trackId) {
      return {
        status: "ok" as const,
        accepted: false,
        state: session.manager.state(),
        round: session.manager.round(),
        deadlineMs: session.manager.deadlineMs(),
      };
    }

    // Runtime delivery failures can be transient (upstream rate-limit/challenge/network),
    // so do not permanently blacklist the catalog entry from a single room report.

    logEvent("warn", "room_animethemes_media_unavailable_reported", {
      roomCode,
      round: currentRound,
      state,
      playerId,
      trackId,
      nowMs,
    });

    return {
      status: "ok" as const,
      accepted: false,
      state: session.manager.state(),
      round: session.manager.round(),
      deadlineMs: session.manager.deadlineMs(),
    };
  }

  reportMediaPrepared(roomCode: string, playerId: string, trackId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };

    const nowMs = this.now();
    this.progressSession(session, nowMs);
    if (session.manager.state() !== "loading") {
      return { status: "invalid_state" as const };
    }

    const currentRound = session.manager.round();
    const activeTrack = currentRound > 0 ? session.trackPool[currentRound - 1] ?? null : null;
    if (!activeTrack || activeTrack.provider !== "animethemes" || activeTrack.id !== trackId) {
      return {
        status: "ok" as const,
        accepted: false,
        state: session.manager.state(),
        round: session.manager.round(),
        deadlineMs: session.manager.deadlineMs(),
      };
    }

    if (this.isPlayerSpectating(session, player)) {
      return {
        status: "ok" as const,
        accepted: false,
        state: session.manager.state(),
        round: session.manager.round(),
        deadlineMs: session.manager.deadlineMs(),
      };
    }

    const marked = session.roundSync.markPrepared(playerId, nowMs);
    if (marked.accepted) {
      this.progressSession(session, nowMs);
    }

    return {
      status: "ok" as const,
      accepted: marked.accepted,
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
    if (this.isPlayerSpectating(session, player)) {
      return { status: "ok" as const, accepted: false };
    }

    const result = session.manager.submitAnswer(playerId, answer, nowMs);
    if (result.accepted) {
      this.maybeAdvanceOnUnanimousPhaseCompletion(session, nowMs);
    }
    return { status: "ok" as const, accepted: result.accepted };
  }

  submitDraftAnswer(roomCode: string, playerId: string, answer: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };

    const nowMs = this.now();
    this.progressSession(session, nowMs);

    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };
    if (this.isPlayerSpectating(session, player)) {
      return { status: "ok" as const, accepted: false };
    }

    const normalized = answer.trim().slice(0, 120);
    const result = session.manager.setDraftAnswer(playerId, normalized, nowMs);
    return { status: "ok" as const, accepted: result.accepted };
  }

  postChatMessage(roomCode: string, playerId: string, text: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return { status: "room_not_found" as const };
    const player = session.players.get(playerId);
    if (!player) return { status: "player_not_found" as const };

    const normalized = text.trim();
    if (normalized.length <= 0) return { status: "invalid_payload" as const };

    const entry: RoomChatMessage = {
      id: `${this.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: player.id,
      displayName: player.displayName,
      text: normalized.slice(0, 400),
      sentAtMs: this.now(),
    };
    session.chatMessages.push(entry);
    if (session.chatMessages.length > 120) {
      session.chatMessages = session.chatMessages.slice(-120);
    }

    return { status: "ok" as const, message: entry };
  }

  playerUserId(roomCode: string, playerId: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;
    const player = session.players.get(playerId);
    return player?.userId ?? null;
  }

  roomState(roomCode: string) {
    const session = this.rooms.get(roomCode);
    if (!session) return null;

    const nowMs = this.now();
    this.progressSession(session, nowMs);
    const state = session.manager.state() as GameState;
    const currentRound = session.manager.round();
    const activeTrack = this.trackForRound(session, currentRound);
    if (activeTrack) {
      scheduleRomanizeJapanese(activeTrack.title);
      scheduleRomanizeJapanese(activeTrack.artist);
    }
    const currentMode = currentRound > 0 ? (session.roundModes[currentRound - 1] ?? null) : null;
    if (session.latestReveal) {
      scheduleRomanizeJapanese(session.latestReveal.title);
      scheduleRomanizeJapanese(session.latestReveal.artist);
      const titleRomaji = getRomanizedJapaneseCached(session.latestReveal.title);
      const artistRomaji = getRomanizedJapaneseCached(session.latestReveal.artist);
      if (titleRomaji !== session.latestReveal.titleRomaji) {
        session.latestReveal.titleRomaji = titleRomaji;
      }
      if (artistRomaji !== session.latestReveal.artistRomaji) {
        session.latestReveal.artistRomaji = artistRomaji;
      }
    }

    return createRoomSnapshot({
      session,
      nowMs,
      state,
      currentRound,
      currentMode,
      activeTrack,
      buildRoundChoices: (targetSession, round) => this.buildRoundChoices(targetSession, round),
      ensureHost: (targetSession) => this.ensureHost(targetSession),
      sortedPlayers: (targetSession) => this.sortedPlayers(targetSession),
      isPlayerSpectating: (targetSession, player) => this.isPlayerSpectating(targetSession, player),
      canStartWaitingSession: (targetSession) => this.canStartWaitingSession(targetSession),
      ranking: (targetSession) => this.ranking(targetSession),
      activePlayerIds: (targetSession) => this.activePlayerIds(targetSession),
      trackForRound: (targetSession, round) => this.trackForRound(targetSession, round),
      hasGuessDone: (playerId) => session.manager.hasGuessDone(playerId),
      hasRevealSkipped: (playerId) => session.manager.hasRevealSkipped(playerId),
      embedUrlForTrack,
      collectRoomAnswerSuggestions: (tracks) => collectRoomAnswerSuggestions(tracks),
    });
  }

  async roomAnswerSuggestions(roomCode: string, playerId?: string) {
    const session = this.rooms.get(roomCode);
    if (!session) {
      return { status: "room_not_found" as const };
    }
    if (playerId && !session.players.has(playerId)) {
      return { status: "player_not_found" as const };
    }

    const fallbackTracks =
      session.trackPool.length > 0
        ? [...session.trackPool, ...session.distractorTrackPool]
        : session.playersLikedPool;

    if (session.sourceMode !== "players_liked") {
      return {
        status: "ok" as const,
        suggestions: collectRoomAnswerSuggestions(fallbackTracks, ROOM_ANSWER_SUGGESTION_LIMIT),
      };
    }

    const contributors = this.playersLikedContributors(session);
    const userIds = new Set<string>();
    const providerSet = new Set<LibraryProvider>();
    for (const contributor of contributors) {
      if (contributor.userId) {
        userIds.add(contributor.userId);
      }
      if (this.canUsePlayersLikedProvider(contributor, "spotify")) {
        providerSet.add("spotify");
      }
      if (this.canUsePlayersLikedProvider(contributor, "deezer")) {
        providerSet.add("deezer");
      }
    }

    if (userIds.size <= 0 || providerSet.size <= 0) {
      return {
        status: "ok" as const,
        suggestions: collectRoomAnswerSuggestions(fallbackTracks, ROOM_ANSWER_SUGGESTION_LIMIT),
      };
    }

    const rows = await userLikedTrackRepository.listForUsers({
      userIds: [...userIds],
      providers: [...providerSet],
      limit: ROOM_BULK_ANSWER_TRACK_LIMIT,
      orderBy: "random",
      randomSeed: `${roomCode}:${session.createdAtMs}`,
    });
    const fromLibrary = collectRoomAnswerSuggestions(rows, ROOM_BULK_ANSWER_SUGGESTION_LIMIT);
    if (fromLibrary.length > 0) {
      return { status: "ok" as const, suggestions: fromLibrary };
    }

    return {
      status: "ok" as const,
      suggestions: collectRoomAnswerSuggestions(fallbackTracks, ROOM_ANSWER_SUGGESTION_LIMIT),
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
      sourceMode: RoomSourceMode;
      playlistName: string | null;
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
        sourceMode: session.sourceMode,
        playlistName: session.publicPlaylistSelection?.name ?? null,
        deadlineMs: session.manager.deadlineMs(),
        serverNowMs: nowMs,
      });
    }

    return rooms.sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 50);
  }
}

export const roomStore = new RoomStore();
