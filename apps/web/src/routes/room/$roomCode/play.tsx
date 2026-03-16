import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import Select, { type InputActionMeta, type SingleValue } from "react-select";
import { toRomaji } from "wanakana";
import {
  getAccountTitlePreference,
  getRoomAnswerSuggestions,
  HttpStatusError,
  kickPlayer,
  leaveRoom as leaveRoomApi,
  markRoomMediaPrepared,
  replayRoom,
  searchAnimeAutocomplete,
  searchPlaylistsAcrossProviders,
  sendRoomChatMessage,
  setPlayerReady,
  setRoomContentFilters,
  setRoomDifficulty,
  setRoomLives,
  setRoomPublicPlaylist,
  setRoomSourceMode,
  setRoomThemeMode,
  setRoomRoundConfig,
  setRoomAnswerMode,
  skipRoomRound,
  startRoom,
  submitRoomAnswer,
  submitRoomAnswerDraft,
  type RoomContentFilters,
  type RoomDifficultyFilter,
  type RoundChoice,
  type TitlePreference,
  type UnifiedPlaylistOption,
} from "../../../lib/api";
import { logClientEvent } from "../../../lib/logger";
import { notify } from "../../../lib/notify";
import { fetchLiveRoomState } from "../../../lib/realtime";
import {
  DEFAULT_USER_GAME_SETTINGS,
  isDefaultRememberedGameSettings,
  loadRememberedGameSettings,
  persistRememberedGameSettings,
  roomStateToRememberedGameSettings,
  shouldRestoreRememberedGameSettings,
  type RememberedGameSettings,
} from "../../../lib/userGameSettingsMemory";
import {
  getEffectiveRoomDeadlineMs,
  getEffectiveRoomPhase,
  getEffectiveRoomStartedAtMs,
  getNextRoomTransitionAtMs,
} from "../../../lib/liveRoundTiming";
import { useRoomRealtimeSubscription } from "../../../lib/useRoomRealtimeSubscription";
import { useGameStore } from "../../../stores/gameStore";

const ROUND_MS = 20_000;
const COUNTDOWN_MS = 3_000;
const REVEAL_MS = 20_000;
const LEADERBOARD_MS = 0;
const ANIME_MEDIA_LONG_LOAD_TOAST_MS = 20_000;
const ANIME_MEDIA_SOFT_RETRY_TIMEOUT_MS = 90_000;
const ANIME_MEDIA_PREPARED_BUFFER_SEC = 1.25;
const ANIME_MEDIA_VERIFIED_START_ADVANCE_SEC = 0.2;
const ANIME_MEDIA_WARMUP_VERIFY_TIMEOUT_MS = 4_000;
const MEDIA_READY_RETRY_DELAY_MS = 350;
const MEDIA_READY_RETRY_MAX_ATTEMPTS = 4;

type SourceMode = "public_playlist" | "players_liked" | "anilist_union" | "random_classic";
type ThemeMode = "op_only" | "ed_only" | "mix";
type DifficultyFilter = RoomDifficultyFilter;
type AnswerMode = "mcq_only" | "text_only" | "mixed";
type LivesPreset = 0 | 1 | 2 | 3 | 5;
type AnswerSelectOption = {
  value: string;
  label: string;
};
const CONTENT_FILTER_DECADES = [
  { start: 1990, label: "90s" },
  { start: 2000, label: "2000s" },
  { start: 2010, label: "2010s" },
  { start: 2020, label: "2020s" },
] as const;
const CONTENT_FILTER_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
] as const;
const LIVES_PRESETS: readonly LivesPreset[] = [0, 1, 2, 3, 5];

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : null;
}

function roomMissingMessage() {
  return "Cette room n'est plus disponible.";
}

function playerSessionExpiredMessage() {
  return "Ta session joueur a expire. Rejoins la room.";
}

function hostOnlyMessage(action: string) {
  return `Seul le host peut ${action}.`;
}

function sourceModeLabel(mode: SourceMode) {
  if (mode === "anilist_union") return "AniList synchronise";
  if (mode === "random_classic") return "Blindtest aléatoire classique";
  if (mode === "players_liked") return "Liked Songs joueurs";
  return "Playlist publique";
}

function themeModeLabel(mode: ThemeMode) {
  if (mode === "op_only") return "OP only";
  if (mode === "ed_only") return "ED only";
  return "Mix";
}

function difficultyFilterLabel(filter: DifficultyFilter) {
  if (filter === "easy") return "Facile";
  if (filter === "medium") return "Moyen";
  if (filter === "hard") return "Difficile";
  return "Tous";
}

function contentDecadesLabel(filters: RoomContentFilters) {
  if (filters.decades.length <= 0) return "Toutes";
  return CONTENT_FILTER_DECADES
    .filter((entry) => filters.decades.includes(entry.start))
    .map((entry) => entry.label)
    .join(", ");
}

function contentGenresLabel(filters: RoomContentFilters) {
  if (filters.genres.length <= 0) return "Tous";
  return filters.genres.join(", ");
}

function livesPresetLabel(preset: number) {
  if (preset <= 0) return "Off";
  return preset === 1 ? "1 vie" : `${preset} vies`;
}

function renderLivesHearts(lives: number, maxLives: number) {
  const safeLives = Math.max(0, Math.min(maxLives, lives));
  return `${"♥".repeat(safeLives)}${"♡".repeat(Math.max(0, maxLives - safeLives))}`;
}

function snapshotErrorMessage(error: unknown) {
  if (errorCode(error) === "ROOM_NOT_FOUND") {
    return roomMissingMessage();
  }
  return "Synchronisation impossible.";
}

function startErrorMessage(error: unknown, spotifyCooldownRemainingSec: number) {
  switch (errorCode(error)) {
    case "ANILIST_REMOTE_FAILURE":
      return "AniList est temporairement indisponible pour ce mode aleatoire. Reessaie dans quelques secondes.";
    case "NO_TRACKS_FOUND":
      return "Aucune chanson jouable trouvee pour le moment. Reessaie dans quelques secondes.";
    case "SPOTIFY_RATE_LIMITED":
      return `Spotify limite temporairement les requetes. Reessaie dans ${spotifyCooldownRemainingSec}s.`;
    case "SOURCE_NOT_SET":
      return "Le host doit choisir une playlist avant de lancer.";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "PLAYERS_LIBRARY_NOT_READY":
      return "Le mode AniList necessite au moins un joueur avec une bibliotheque AniList synchronisee.";
    case "HOST_ONLY":
      return hostOnlyMessage("lancer la partie");
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible de lancer la partie.";
  }
}

function sourceModeErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("changer le mode source");
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible de mettre a jour le mode source.";
  }
}

function themeModeErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("changer le mode themes");
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible de mettre a jour le mode themes.";
  }
}

function difficultyFilterErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("changer la difficulte");
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible de mettre a jour la difficulte.";
  }
}

function publicPlaylistErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("choisir la playlist publique");
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible de mettre a jour la playlist publique.";
  }
}

function readyErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "INVALID_STATE":
      return "Le statut pret se gere uniquement dans le lobby.";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible de mettre a jour ton statut.";
  }
}

function kickErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("ejecter un joueur");
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible d'ejecter ce joueur.";
  }
}

function replayErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("relancer une partie");
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible de revenir au lobby.";
  }
}

function skipErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "INVALID_STATE":
      return "Le vote Skip/Next n'est pas disponible dans cet etat.";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible d'enregistrer ton vote pour le moment.";
  }
}

function chatErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Impossible d'envoyer le message.";
  }
}

function answerErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case "ANSWER_NOT_ACCEPTED":
      return "Reponse non prise en compte (round expire ou deja valide).";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage();
    case "ROOM_NOT_FOUND":
      return roomMissingMessage();
    default:
      return "Reponse refusee.";
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function phaseProgress(phase: string | undefined, remainingMs: number | null) {
  if (remainingMs === null) return 0;
  if (phase === "countdown") return clamp01((COUNTDOWN_MS - remainingMs) / COUNTDOWN_MS);
  if (phase === "loading") return 0;
  if (phase === "playing") return clamp01((ROUND_MS - remainingMs) / ROUND_MS);
  if (phase === "reveal") return clamp01((REVEAL_MS - remainingMs) / REVEAL_MS);
  if (phase === "leaderboard") {
    if (LEADERBOARD_MS <= 0) return 1;
    return clamp01((LEADERBOARD_MS - remainingMs) / LEADERBOARD_MS);
  }
  return 0;
}

const WAVE_BARS = Array.from({ length: 48 }, (_, index) => ({
  key: index,
  heightPercent: 22 + ((index * 17) % 70),
  delaySec: (index % 8) * 0.08,
}));

function withRomajiLabel(value: string, providedRomaji?: string | null) {
  if (!value) return value;
  const romaji = providedRomaji?.trim().length ? providedRomaji.trim() : toRomaji(value).trim();
  if (!romaji || romaji.toLowerCase() === value.toLowerCase()) return value;
  return romaji;
}

function normalizeChoiceLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEASON_SUFFIX_RE =
  /\s*(?:(?:Season|Saison|S)\s*\d+|Part\s*\d+|\d+(?:st|nd|rd|th)\s*Season|:\s*(?:.*?(?:Season|Part|Final|Cour).*)$)/i;

function stripSeasonSuffix(title: string) {
  return title.replace(SEASON_SUFFIX_RE, "").trim();
}

function formatRoundChoiceLabel(choice: RoundChoice, preference: TitlePreference) {
  const romajiTitle = withRomajiLabel(choice.titleRomaji);
  const englishTitle = choice.titleEnglish?.trim() ?? "";
  const hasDistinctEnglish =
    englishTitle.length > 0 &&
    normalizeChoiceLabel(englishTitle) !== normalizeChoiceLabel(choice.titleRomaji);

  if (preference === "english" && hasDistinctEnglish) {
    return `${englishTitle} - ${choice.themeLabel}`;
  }
  if (preference === "mixed" && hasDistinctEnglish) {
    return `${romajiTitle} (${englishTitle}) - ${choice.themeLabel}`;
  }
  return `${romajiTitle} - ${choice.themeLabel}`;
}

function formatRevealTitle(
  reveal: { title: string; titleRomaji: string | null; titleEnglish?: string | null },
  preference: TitlePreference,
) {
  const romaji = withRomajiLabel(reveal.title, reveal.titleRomaji);
  const english = (reveal.titleEnglish ?? "").trim();
  const hasDistinctEnglish =
    english.length > 0 && normalizeChoiceLabel(english) !== normalizeChoiceLabel(reveal.title);

  if (preference === "english" && hasDistinctEnglish) return english;
  if (preference === "mixed" && hasDistinctEnglish) return `${romaji} (${english})`;
  return romaji;
}

function revealArtworkUrl(reveal: {
  provider:
    | UnifiedPlaylistOption["provider"]
    | "spotify"
    | "youtube"
    | "apple-music"
    | "tidal"
    | "animethemes";
  trackId: string;
}) {
  if (reveal.provider === "youtube") {
    return `https://i.ytimg.com/vi/${reveal.trackId}/hqdefault.jpg`;
  }
  return null;
}

function lobbyReadyStatusLabel(
  state:
    | {
        allReady: boolean;
        canStart: boolean;
        isResolvingTracks: boolean;
        poolBuild: {
          status: "idle" | "building" | "ready" | "failed";
        };
        sourceMode: "public_playlist" | "players_liked" | "anilist_union" | "random_classic";
        sourceConfig: {
          publicPlaylist: {
            sourceQuery: string;
          } | null;
        };
      }
    | null
    | undefined,
  isHost: boolean,
  hasActivePlayerSeat: boolean,
) {
  if (!state?.allReady) return "";
  if (!hasActivePlayerSeat) return " · Ta session joueur n'est plus active. Rejoins la room.";
  if (state.isResolvingTracks) return " · Préparation audio en cours...";
  if (!state.canStart) {
    if (state.sourceMode === "public_playlist" && !state.sourceConfig.publicPlaylist?.sourceQuery) {
      return isHost
        ? " · Choisis une playlist pour lancer."
        : " · En attente de la playlist du host.";
    }
    if (state.sourceMode === "players_liked" || state.sourceMode === "anilist_union") {
      return isHost
        ? " · Configure un pseudo AniList puis synchronise pour lancer."
        : " · En attente de la configuration du host.";
    }
    return "";
  }
  if (
    (state.sourceMode === "players_liked" || state.sourceMode === "anilist_union") &&
    state.poolBuild.status !== "ready"
  ) {
    return " · Préparation de la playlist des joueurs en cours...";
  }
  return isHost ? " · Lancement auto en cours..." : " · En attente du host pour lancer.";
}

function isUnifiedPlaylistOption(value: unknown): value is UnifiedPlaylistOption {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UnifiedPlaylistOption>;
  const providerOk = candidate.provider === "deezer";
  return (
    providerOk &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.sourceQuery === "string"
  );
}

function rankAnswerSuggestions(values: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length <= 0) return values;

  const startsWith: string[] = [];
  const includes: string[] = [];

  for (const value of values) {
    const normalized = value.toLowerCase();
    if (normalized.startsWith(normalizedQuery)) {
      startsWith.push(value);
      continue;
    }
    if (normalized.includes(normalizedQuery)) {
      includes.push(value);
    }
  }

  if (startsWith.length <= 0 && includes.length <= 0) {
    return values.slice(0, 8);
  }
  return [...startsWith, ...includes];
}

export function RoomPlayPage() {
  const { roomCode } = useParams({ from: "/room/$roomCode/play" });
  const navigate = useNavigate();
  const session = useGameStore((state) => state.session);
  const account = useGameStore((state) => state.account);
  const setAccount = useGameStore((state) => state.setAccount);
  const clearSession = useGameStore((state) => state.clearSession);
  const setLiveRound = useGameStore((state) => state.setLiveRound);
  const [answer, setAnswer] = useState("");
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [iframeEpoch, setIframeEpoch] = useState(0);
  const [animePlaybackStatus, setAnimePlaybackStatus] = useState<
    "idle" | "buffering" | "warming" | "ready" | "playing"
  >("idle");
  const [stableYoutubePlayback, setStableYoutubePlayback] = useState<{
    key: string;
    embedUrl: string;
  } | null>(null);
  const [stableAnimeVideoPlayback, setStableAnimeVideoPlayback] = useState<{
    key: string;
    sourceUrl: string;
  } | null>(null);
  const [submittedMcq, setSubmittedMcq] = useState<{ round: number; choice: string } | null>(null);
  const [submittedText, setSubmittedText] = useState<{ round: number; value: string } | null>(null);
  const [answerSuggestionPool, setAnswerSuggestionPool] = useState<string[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>("anilist_union");
  const [themeMode, setThemeMode] = useState<ThemeMode>("mix");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [contentFilters, setContentFilters] = useState<RoomContentFilters>({ decades: [], genres: [] });
  const [answerMode, setAnswerMode] = useState<AnswerMode>("mixed");
  const [livesMode, setLivesMode] = useState(false);
  const [maxLives, setMaxLives] = useState(3);
  const [maxRounds, setMaxRounds] = useState(10);
  const [playingMs, setPlayingMs] = useState(20_000);
  const [revealMs, setRevealMs] = useState(20_000);
  const titlePreference = account.titlePreference;
  const [debouncedAnswer, setDebouncedAnswer] = useState("");
  const [playlistQuery, setPlaylistQuery] = useState("top hits");
  const [debouncedPlaylistQuery, setDebouncedPlaylistQuery] = useState("top hits");
  const [playlistOffset, setPlaylistOffset] = useState(0);
  const [playlistOptions, setPlaylistOptions] = useState<UnifiedPlaylistOption[]>([]);
  const [hasMorePlaylists, setHasMorePlaylists] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [spotifyRateLimitUntilMs, setSpotifyRateLimitUntilMs] = useState<number | null>(null);
  const [startRetryNotBeforeMs, setStartRetryNotBeforeMs] = useState<number | null>(null);
  const [phaseSkipVote, setPhaseSkipVote] = useState<{
    phase: "playing" | "reveal";
    round: number;
  } | null>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const animeVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPreviewRef = useRef<string | null>(null);
  const autoStartRoundRef = useRef<number>(0);
  const leaveSentRef = useRef(false);
  const progressStateRef = useRef<{ key: string; value: number }>({ key: "", value: 0 });
  const postRoundProgressRef = useRef<{ key: string; startedAtMs: number } | null>(null);
  const audioRetryTimeoutRef = useRef<number | null>(null);
  const mediaReadyRetryTimeoutRef = useRef<number | null>(null);
  const mediaReadyRetryRef = useRef<{ key: string; attempts: number } | null>(null);
  const autoSubmitSignatureRef = useRef<string | null>(null);
  const draftSignatureRef = useRef<string | null>(null);
  const reportedMediaReadyRef = useRef<string | null>(null);
  const animeLongLoadToastRef = useRef<string | null>(null);
  const animeLastProgressAtRef = useRef<number | null>(null);
  const animeReloadAttemptRef = useRef<{ key: string; count: number } | null>(null);
  const animeWarmupRafRef = useRef<number | null>(null);
  const animeWarmupVerificationRef = useRef<{
    key: string;
    baselineSec: number;
    startedAtMs: number;
  } | null>(null);
  const animeWarmupVerifiedKeyRef = useRef<string | null>(null);
  const animeDiagnosticsRef = useRef<Set<string>>(new Set());
  const userInteractionUnlockedRef = useRef(false);
  const roomMissingRedirectedRef = useRef(false);
  const rememberedSettingsRestoreAttemptedRef = useRef(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastSnapshotErrorToastRef = useRef<string | null>(null);
  const lastAudioErrorToastRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (mediaReadyRetryTimeoutRef.current !== null) {
        window.clearTimeout(mediaReadyRetryTimeoutRef.current);
        mediaReadyRetryTimeoutRef.current = null;
      }
      if (animeWarmupRafRef.current !== null) {
        window.cancelAnimationFrame(animeWarmupRafRef.current);
        animeWarmupRafRef.current = null;
      }
      try {
        const video = animeVideoRef.current;
        if (video) {
          video.pause();
          video.removeAttribute("src");
          video.load();
        }
      } catch {
        // Ignore cleanup failures during unmount.
      }
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(Date.now() + serverClockOffsetMs), 80);
    return () => window.clearInterval(id);
  }, [serverClockOffsetMs]);

  const realtimeConnected = useRoomRealtimeSubscription(roomCode);
  const snapshotQuery = useQuery({
    queryKey: ["realtime-room", roomCode],
    queryFn: async () => {
      const snapshot = await fetchLiveRoomState(roomCode);
      return {
        ok: true as const,
        roomCode,
        snapshot,
        serverNowMs: snapshot.serverNowMs,
      };
    },
    refetchInterval: realtimeConnected ? false : 1_000,
  });

  const state = snapshotQuery.data?.snapshot;

  useEffect(() => {
    const activePhases = ["countdown", "loading", "playing", "reveal", "leaderboard"];
    const isGameActive = state?.state != null && activePhases.includes(state.state);
    if (isGameActive) {
      document.documentElement.classList.add("game-active");
    } else {
      document.documentElement.classList.remove("game-active");
    }
    return () => {
      document.documentElement.classList.remove("game-active");
    };
  }, [state?.state]);

  const titlePrefQuery = useQuery({
    queryKey: ["account-title-preference"],
    queryFn: getAccountTitlePreference,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!titlePrefQuery.isSuccess) return;
    setAccount({ titlePreference: titlePrefQuery.data.titlePreference });
  }, [titlePrefQuery.data?.titlePreference, titlePrefQuery.isSuccess, setAccount]);

  useEffect(() => {
    if (typeof snapshotQuery.data?.serverNowMs !== "number") return;
    setServerClockOffsetMs(snapshotQuery.data.serverNowMs - Date.now());
  }, [snapshotQuery.data?.serverNowMs]);
  const effectivePhase = useMemo(
    () => getEffectiveRoomPhase(state, clockNow),
    [clockNow, state],
  );
  const effectiveDeadlineMs = useMemo(
    () => getEffectiveRoomDeadlineMs(state, clockNow, ROUND_MS),
    [clockNow, state],
  );
  const effectiveStartedAtMs = useMemo(
    () => getEffectiveRoomStartedAtMs(state, clockNow, ROUND_MS),
    [clockNow, state],
  );
  const nextTransitionAtMs = useMemo(
    () => getNextRoomTransitionAtMs(state),
    [state?.deadlineMs, state?.roundSync?.plannedStartAtMs, state?.state],
  );

  useEffect(() => {
    if (nextTransitionAtMs === null) return;
    const delayMs = Math.max(0, nextTransitionAtMs - (Date.now() + serverClockOffsetMs) + 40);
    const timeoutId = window.setTimeout(() => {
      snapshotQuery.refetch().catch(() => undefined);
    }, delayMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [nextTransitionAtMs, serverClockOffsetMs, snapshotQuery.refetch]);

  useEffect(() => {
    if (roomMissingRedirectedRef.current) return;
    const error = snapshotQuery.error;
    if (!(error instanceof HttpStatusError)) return;
    if (error.status !== 404 || error.message !== "ROOM_NOT_FOUND") return;
    roomMissingRedirectedRef.current = true;
    notify.error(roomMissingMessage(), {
      key: `room-play:missing-room:${roomCode}`,
    });
    clearSession();
    navigate({ to: "/" });
  }, [clearSession, navigate, roomCode, snapshotQuery.error]);

  useEffect(() => {
    const error = snapshotQuery.error;
    if (!error) {
      lastSnapshotErrorToastRef.current = null;
      return;
    }
    if (
      error instanceof HttpStatusError &&
      error.status === 404 &&
      error.message === "ROOM_NOT_FOUND"
    ) {
      return;
    }
    const signature =
      error instanceof HttpStatusError
        ? `${error.status}:${error.message}`
        : (errorCode(error) ?? "UNKNOWN_ERROR");
    if (lastSnapshotErrorToastRef.current === signature) return;
    lastSnapshotErrorToastRef.current = signature;
    notify.error(snapshotErrorMessage(error), {
      key: `room-play:snapshot:${roomCode}:${signature}`,
    });
  }, [roomCode, snapshotQuery.error]);

  const isHost = Boolean(session.playerId && state?.hostPlayerId === session.playerId);
  const isWaitingLobby = state?.state === "waiting";
  const isResolvingTracks = Boolean(state?.isResolvingTracks);
  const isPlayersLikedPoolBuilding =
    (state?.sourceMode === "players_liked" || state?.sourceMode === "anilist_union") &&
    state.poolBuild.status === "building";
  const currentPlayer =
    state?.players.find((player) => player.playerId === session.playerId) ?? null;
  const hasActivePlayerSeat = Boolean(currentPlayer);
  const lobbyReadyStatus = lobbyReadyStatusLabel(state, isHost, hasActivePlayerSeat);
  const typedPlaylistQuery = playlistQuery.trim();
  const normalizedPlaylistQuery = debouncedPlaylistQuery.trim();
  const typedAnswer = answer.trim();
  const chatMessages = useMemo(() => {
    const messages = [...(state?.chatMessages ?? [])];
    messages.sort((left, right) => left.sentAtMs - right.sentAtMs);
    return messages;
  }, [state?.chatMessages]);

  useEffect(() => {
    if (!state?.sourceMode) return;
    setSourceMode(state.sourceMode);
  }, [state?.sourceMode]);

  useEffect(() => {
    if (!state?.sourceConfig?.themeMode) return;
    setThemeMode(state.sourceConfig.themeMode);
  }, [state?.sourceConfig?.themeMode]);

  useEffect(() => {
    if (!state?.sourceConfig?.difficultyFilter) return;
    setDifficultyFilter(state.sourceConfig.difficultyFilter);
  }, [state?.sourceConfig?.difficultyFilter]);

  useEffect(() => {
    if (!state?.sourceConfig?.contentFilters) return;
    setContentFilters(state.sourceConfig.contentFilters);
  }, [state?.sourceConfig?.contentFilters]);

  useEffect(() => {
    if (!state?.answerMode) return;
    setAnswerMode(state.answerMode);
  }, [state?.answerMode]);

  useEffect(() => {
    if (typeof state?.livesMode !== "boolean") return;
    setLivesMode(state.livesMode);
    setMaxLives(state.maxLives);
  }, [state?.livesMode, state?.maxLives]);

  useEffect(() => {
    if (!state?.roomRoundConfig) return;
    setMaxRounds(state.roomRoundConfig.maxRounds);
    setPlayingMs(state.roomRoundConfig.playingMs);
    setRevealMs(state.roomRoundConfig.revealMs);
  }, [state?.roomRoundConfig]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedPlaylistQuery(playlistQuery);
    }, 320);
    return () => window.clearTimeout(timeoutId);
  }, [playlistQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedAnswer(typedAnswer);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [typedAnswer]);

  useEffect(() => {
    setPlaylistOffset(0);
  }, [normalizedPlaylistQuery, sourceMode, roomCode]);

  const playlistSearchQuery = useQuery({
    queryKey: ["lobby-playlist-search", normalizedPlaylistQuery, playlistOffset],
    queryFn: async () => {
      const payload = (await searchPlaylistsAcrossProviders({
        q: normalizedPlaylistQuery,
        limit: 24,
        offset: playlistOffset,
      })) as {
        ok: boolean;
        q: string;
        hasMore: boolean;
        nextOffset: number | null;
        playlists: unknown;
      };
      const rawPlaylists = Array.isArray(payload.playlists) ? payload.playlists : [];
      const playlists = rawPlaylists.filter(isUnifiedPlaylistOption);
      return {
        ok: payload.ok,
        q: payload.q,
        hasMore: payload.hasMore,
        nextOffset: payload.nextOffset,
        playlists,
      };
    },
    enabled:
      isWaitingLobby &&
      isHost &&
      sourceMode === "public_playlist" &&
      normalizedPlaylistQuery.length >= 2,
    staleTime: 2 * 60_000,
  });

  const bulkAnswerSuggestionsQuery = useQuery({
    queryKey: [
      "room-answer-suggestions",
      roomCode,
      state?.sourceMode ?? "unknown",
      session.playerId ?? "anonymous",
    ],
    queryFn: () =>
      getRoomAnswerSuggestions({
        roomCode,
        playerId: session.playerId,
      }),
    enabled: Boolean(session.playerId),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const animeAutocompleteQuery = useQuery({
    queryKey: ["anime-autocomplete", debouncedAnswer],
    queryFn: () => searchAnimeAutocomplete({ q: debouncedAnswer, limit: 12 }),
    enabled: debouncedAnswer.length >= 1 && effectivePhase === "playing" && state?.mode === "text",
    staleTime: 30_000,
    retry: 1,
  });

  const maxSuggestionPoolSize = 24_000;

  useEffect(() => {
    setAnswerSuggestionPool([]);
  }, [roomCode]);

  useEffect(() => {
    const incomingSuggestions = state?.answerSuggestions ?? [];
    if (incomingSuggestions.length <= 0) return;

    setAnswerSuggestionPool((previous) => {
      const merged = [...previous];
      const seen = new Set(merged.map((value) => value.toLowerCase()));

      for (const value of incomingSuggestions) {
        const normalized = value.trim();
        if (normalized.length < 2) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(normalized);
      }

      if (merged.length <= maxSuggestionPoolSize) return merged;
      return merged.slice(-maxSuggestionPoolSize);
    });
  }, [state?.answerSuggestions]);

  useEffect(() => {
    const incomingSuggestions = bulkAnswerSuggestionsQuery.data?.suggestions ?? [];
    if (incomingSuggestions.length <= 0) return;

    setAnswerSuggestionPool((previous) => {
      const merged = [...previous];
      const seen = new Set(merged.map((value) => value.toLowerCase()));

      for (const value of incomingSuggestions) {
        const normalized = value.trim();
        if (normalized.length < 2) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(normalized);
      }

      if (merged.length <= maxSuggestionPoolSize) return merged;
      return merged.slice(-maxSuggestionPoolSize);
    });
  }, [bulkAnswerSuggestionsQuery.data?.suggestions]);

  const answerSelectOptions = useMemo<AnswerSelectOption[]>(() => {
    if (typedAnswer.length < 1) return [];
    const fromApi = animeAutocompleteQuery.data?.suggestions ?? [];
    const rankedPool = rankAnswerSuggestions(answerSuggestionPool, typedAnswer);
    const values = [...fromApi.map((item) => item.label), ...rankedPool];
    const deduped: AnswerSelectOption[] = [];
    const seen = new Set<string>();
    const seenFranchise = new Set<string>();
    for (const value of values) {
      const normalized = value.trim();
      if (normalized.length <= 0) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const franchise = normalizeChoiceLabel(stripSeasonSuffix(normalized));
      if (franchise.length > 0 && seenFranchise.has(franchise)) continue;
      if (franchise.length > 0) seenFranchise.add(franchise);
      deduped.push({ value: normalized, label: normalized });
    }
    return deduped;
  }, [animeAutocompleteQuery.data?.suggestions, answerSuggestionPool, typedAnswer]);
  const selectedAnswerOption = useMemo<AnswerSelectOption | null>(() => {
    const normalized = answer.trim();
    if (normalized.length <= 0) return null;
    const existing =
      answerSelectOptions.find(
        (option) => option.value.toLowerCase() === normalized.toLowerCase(),
      ) ?? null;
    if (existing) return existing;
    return { value: normalized, label: normalized };
  }, [answer, answerSelectOptions]);
  const answerSeedIsLoading =
    effectivePhase === "playing" &&
    state?.mode === "text" &&
    (isResolvingTracks ||
      bulkAnswerSuggestionsQuery.isFetching ||
      animeAutocompleteQuery.isFetching) &&
    answerSuggestionPool.length <= 0;
  const currentRoomSettings = state ? roomStateToRememberedGameSettings(state) : null;

  const showRevealAnswersInLeaderboard =
    state?.state === "reveal" || state?.state === "leaderboard";
  const revealAnswerByPlayerId = useMemo(() => {
    const map = new Map<
      string,
      { answer: string | null; submitted: boolean; isCorrect: boolean }
    >();
    if (!showRevealAnswersInLeaderboard || !state?.reveal) return map;
    for (const entry of state.reveal.playerAnswers) {
      map.set(entry.playerId, {
        answer: entry.answer,
        submitted: entry.submitted,
        isCorrect: entry.isCorrect,
      });
    }
    return map;
  }, [showRevealAnswersInLeaderboard, state?.reveal]);

  useEffect(() => {
    if (!playlistSearchQuery.data) return;
    setHasMorePlaylists(Boolean(playlistSearchQuery.data.hasMore));
    setPlaylistOptions((previous) => {
      if (playlistOffset <= 0) return playlistSearchQuery.data?.playlists ?? [];
      const merged = [...previous];
      const seen = new Set(merged.map((item) => `${item.provider}:${item.id}`));
      for (const playlist of playlistSearchQuery.data.playlists ?? []) {
        const key = `${playlist.provider}:${playlist.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(playlist);
      }
      return merged;
    });
  }, [playlistOffset, playlistSearchQuery.data]);
  useEffect(() => {
    if (!state) {
      setLiveRound(null);
      return;
    }

    setLiveRound({
      phase: effectivePhase ?? state.state,
      isLoadingMedia: effectivePhase === "loading",
      mode: state.mode,
      round: state.round,
      totalRounds: state.totalRounds,
      deadlineMs: effectiveDeadlineMs,
      roundSync: state.roundSync,
      guessDoneCount: state.guessDoneCount,
      guessTotalCount: state.guessTotalCount,
      mediaReadyCount: state.mediaReadyCount,
      mediaReadyTotalCount: state.mediaReadyTotalCount,
      revealSkipCount: state.revealSkipCount,
      revealSkipTotalCount: state.revealSkipTotalCount,
      previewUrl: state.previewUrl,
      media: state.media,
      nextMedia: state.nextMedia,
      choices: state.choices,
      reveal: state.reveal
        ? {
            trackId: state.reveal.trackId,
            provider: state.reveal.provider,
            title: state.reveal.title,
            artist: state.reveal.artist,
            songTitle: state.reveal.songTitle,
            songArtists: state.reveal.songArtists,
            acceptedAnswer: state.reveal.acceptedAnswer,
            previewUrl: state.reveal.previewUrl,
            sourceUrl: state.reveal.sourceUrl,
            embedUrl: state.reveal.embedUrl,
            playerAnswers: state.reveal.playerAnswers,
          }
        : null,
      leaderboard: state.leaderboard,
    });
  }, [effectiveDeadlineMs, effectivePhase, setLiveRound, state]);

  const startMutation = useMutation({
    mutationFn: () => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return startRoom({
        roomCode,
        playerId: session.playerId,
      });
    },
    onSuccess: (result) => {
      if (result.ok === false) {
        const retryAfterMs =
          typeof result.retryAfterMs === "number" && result.retryAfterMs > 0
            ? result.retryAfterMs
            : 1_500;
        autoStartRoundRef.current = 0;
        setStartRetryNotBeforeMs(Date.now() + retryAfterMs);
        setSpotifyRateLimitUntilMs(null);
        snapshotQuery.refetch();
        return;
      }
      setStartRetryNotBeforeMs(null);
      setSpotifyRateLimitUntilMs(null);
      snapshotQuery.refetch();
    },
    onError: (error) => {
      if (error instanceof HttpStatusError && error.message === "SPOTIFY_RATE_LIMITED") {
        const retryAfterMs =
          error.retryAfterMs && error.retryAfterMs > 0 ? error.retryAfterMs : 10_000;
        setSpotifyRateLimitUntilMs(Date.now() + retryAfterMs);
        setStartRetryNotBeforeMs(null);
        notify.error(startErrorMessage(error, Math.max(1, Math.ceil(retryAfterMs / 1000))), {
          key: `room-play:start:${roomCode}:spotify-rate-limited`,
        });
        return;
      }
      if (
        error instanceof HttpStatusError &&
        (error.message === "PLAYERS_LIBRARY_SYNCING" ||
          error.message === "PLAYLIST_TRACKS_RESOLVING")
      ) {
        const retryAfterMs =
          error.retryAfterMs && error.retryAfterMs > 0 ? error.retryAfterMs : 1_500;
        // Keep auto-start active while tracks are still being resolved.
        autoStartRoundRef.current = 0;
        setStartRetryNotBeforeMs(Date.now() + retryAfterMs);
        setSpotifyRateLimitUntilMs(null);
        snapshotQuery.refetch();
        return;
      }
      setStartRetryNotBeforeMs(null);
      setSpotifyRateLimitUntilMs(null);
      notify.error(startErrorMessage(error, spotifyCooldownRemainingSec), {
        key: `room-play:start:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const startRetryRemainingMs = useMemo(() => {
    if (!startRetryNotBeforeMs) return 0;
    return Math.max(0, startRetryNotBeforeMs - clockNow);
  }, [clockNow, startRetryNotBeforeMs]);

  useEffect(() => {
    if (!state || !isHost || state.state !== "waiting") {
      autoStartRoundRef.current = 0;
      return;
    }
    if (
      !state.allReady ||
      !state.canStart ||
      startMutation.isPending ||
      startRetryRemainingMs > 0 ||
      isResolvingTracks ||
      isPlayersLikedPoolBuilding
    ) {
      return;
    }
    const signature = state.readyCount * 1000 + state.players.length;
    if (autoStartRoundRef.current === signature) return;
    autoStartRoundRef.current = signature;
    startMutation.mutate();
  }, [
    isHost,
    isResolvingTracks,
    isPlayersLikedPoolBuilding,
    startRetryRemainingMs,
    startMutation,
    startMutation.isPending,
    state,
  ]);

  const sourceModeMutation = useMutation({
    mutationFn: (mode: SourceMode) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomSourceMode({
        roomCode,
        playerId: session.playerId,
        mode,
      });
    },
    onSuccess: (_result, mode) => {
      notify.success(`Mode source: ${sourceModeLabel(mode)}.`);
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error(sourceModeErrorMessage(error), {
        key: `room-play:source-mode:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const themeModeMutation = useMutation({
    mutationFn: (mode: ThemeMode) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomThemeMode({
        roomCode,
        playerId: session.playerId,
        mode,
      });
    },
    onSuccess: (_result, mode) => {
      rememberCurrentRoomSettings({ themeMode: mode });
      notify.success(`Mode themes: ${themeModeLabel(mode)}.`);
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error(themeModeErrorMessage(error), {
        key: `room-play:theme-mode:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const roundConfigMutation = useMutation({
    mutationFn: (config: { maxRounds?: number; playingMs?: number; revealMs?: number }) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomRoundConfig({
        roomCode,
        playerId: session.playerId,
        ...config,
      });
    },
    onSuccess: (_result, config) => {
      rememberCurrentRoomSettings({
        roundConfig: {
          maxRounds: config.maxRounds ?? maxRounds,
          playingMs: config.playingMs ?? playingMs,
          revealMs: config.revealMs ?? revealMs,
        },
      });
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error("Erreur lors de la mise à jour de la configuration.", {
        key: `room-play:round-config:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const answerModeMutation = useMutation({
    mutationFn: (mode: AnswerMode) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomAnswerMode({
        roomCode,
        playerId: session.playerId,
        mode,
      });
    },
    onSuccess: (_result, mode) => {
      rememberCurrentRoomSettings({ answerMode: mode });
      const label = mode === "mcq_only" ? "QCM" : mode === "text_only" ? "Texte" : "Mixte";
      notify.success(`Mode réponse: ${label}.`);
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error("Erreur lors du changement de mode réponse.", {
        key: `room-play:answer-mode:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const difficultyFilterMutation = useMutation({
    mutationFn: (filter: DifficultyFilter) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomDifficulty({
        roomCode,
        playerId: session.playerId,
        filter,
      });
    },
    onSuccess: (_result, filter) => {
      rememberCurrentRoomSettings({ difficultyFilter: filter });
      notify.success(`Difficulte: ${difficultyFilterLabel(filter)}.`);
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error(difficultyFilterErrorMessage(error), {
        key: `room-play:difficulty:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const contentFiltersMutation = useMutation({
    mutationFn: (nextFilters: RoomContentFilters) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomContentFilters({
        roomCode,
        playerId: session.playerId,
        decades: nextFilters.decades,
        genres: nextFilters.genres,
      });
    },
    onSuccess: (_result, nextFilters) => {
      rememberCurrentRoomSettings({ contentFilters: nextFilters });
      notify.success("Filtres de contenu mis a jour.");
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error("Erreur lors du changement des filtres de contenu.", {
        key: `room-play:content-filters:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const livesMutation = useMutation({
    mutationFn: (nextPreset: LivesPreset) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomLives({
        roomCode,
        playerId: session.playerId,
        livesMode: nextPreset > 0,
        maxLives: nextPreset > 0 ? nextPreset : maxLives,
      });
    },
    onSuccess: (_result, nextPreset) => {
      rememberCurrentRoomSettings({
        livesMode: nextPreset > 0,
        maxLives: nextPreset > 0 ? nextPreset : maxLives,
      });
      notify.success(
        nextPreset > 0 ? `Mode vies: ${livesPresetLabel(nextPreset)}.` : "Mode vies desactive.",
      );
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error("Erreur lors du changement du mode vies.", {
        key: `room-play:lives:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const publicPlaylistMutation = useMutation({
    mutationFn: (playlist: UnifiedPlaylistOption) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setRoomPublicPlaylist({
        roomCode,
        playerId: session.playerId,
        id: playlist.id,
        name: playlist.name,
        trackCount: playlist.trackCount,
        sourceQuery: playlist.sourceQuery,
      });
    },
    onSuccess: (_result, playlist) => {
      notify.success(`Playlist publique: ${withRomajiLabel(playlist.name)}.`);
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error(publicPlaylistErrorMessage(error), {
        key: `room-play:playlist:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const readyMutation = useMutation({
    mutationFn: (ready: boolean) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return setPlayerReady({
        roomCode,
        playerId: session.playerId,
        ready,
      });
    },
    onSuccess: (_result, ready) => {
      if (ready) {
        notify.success("Tu es pret.");
      } else {
        notify.info("Tu n'es plus pret.");
      }
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error(readyErrorMessage(error), {
        key: `room-play:ready:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const kickMutation = useMutation({
    mutationFn: (targetPlayerId: string) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return kickPlayer({
        roomCode,
        playerId: session.playerId,
        targetPlayerId,
      });
    },
    onSuccess: () => {
      notify.success("Joueur ejecte.");
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error(kickErrorMessage(error), {
        key: `room-play:kick:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const replayMutation = useMutation({
    mutationFn: () => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return replayRoom({
        roomCode,
        playerId: session.playerId,
      });
    },
    onSuccess: () => {
      notify.success("Retour au lobby.");
      snapshotQuery.refetch();
    },
    onError: (error) => {
      notify.error(replayErrorMessage(error), {
        key: `room-play:replay:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  function rememberedSettingsFromLocalState(
    overrides: Partial<RememberedGameSettings> = {},
  ): RememberedGameSettings {
    const currentRoundConfig = {
      maxRounds,
      playingMs,
      revealMs,
    };
    const nextRoundConfig = overrides.roundConfig
      ? {
          ...currentRoundConfig,
          ...overrides.roundConfig,
        }
      : currentRoundConfig;
    return {
      sourceMode: overrides.sourceMode ?? sourceMode,
      themeMode: overrides.themeMode ?? themeMode,
      difficultyFilter: overrides.difficultyFilter ?? difficultyFilter,
      contentFilters: overrides.contentFilters ?? contentFilters,
      answerMode: overrides.answerMode ?? answerMode,
      livesMode: overrides.livesMode ?? livesMode,
      maxLives: overrides.maxLives ?? maxLives,
      roundConfig: nextRoundConfig,
    };
  }

  function rememberCurrentRoomSettings(overrides: Partial<RememberedGameSettings> = {}) {
    const nextSettings =
      Object.keys(overrides).length <= 0 && currentRoomSettings
        ? currentRoomSettings
        : rememberedSettingsFromLocalState(overrides);
    persistRememberedGameSettings(nextSettings);
  }

  const restoreRememberedSettingsMutation = useMutation({
    mutationFn: async (settings: RememberedGameSettings) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");

      if (settings.sourceMode !== DEFAULT_USER_GAME_SETTINGS.sourceMode) {
        await setRoomSourceMode({
          roomCode,
          playerId: session.playerId,
          mode: settings.sourceMode,
        });
      }
      if (settings.themeMode !== DEFAULT_USER_GAME_SETTINGS.themeMode) {
        await setRoomThemeMode({
          roomCode,
          playerId: session.playerId,
          mode: settings.themeMode,
        });
      }
      if (settings.difficultyFilter !== DEFAULT_USER_GAME_SETTINGS.difficultyFilter) {
        await setRoomDifficulty({
          roomCode,
          playerId: session.playerId,
          filter: settings.difficultyFilter,
        });
      }
      if (
        settings.contentFilters.decades.length > 0 ||
        settings.contentFilters.genres.length > 0
      ) {
        await setRoomContentFilters({
          roomCode,
          playerId: session.playerId,
          decades: settings.contentFilters.decades,
          genres: settings.contentFilters.genres,
        });
      }
      if (settings.answerMode !== DEFAULT_USER_GAME_SETTINGS.answerMode) {
        await setRoomAnswerMode({
          roomCode,
          playerId: session.playerId,
          mode: settings.answerMode,
        });
      }
      if (
        settings.livesMode !== DEFAULT_USER_GAME_SETTINGS.livesMode ||
        (settings.livesMode && settings.maxLives !== DEFAULT_USER_GAME_SETTINGS.maxLives)
      ) {
        await setRoomLives({
          roomCode,
          playerId: session.playerId,
          livesMode: settings.livesMode,
          maxLives: settings.maxLives,
        });
      }
      if (
        settings.roundConfig.maxRounds !== DEFAULT_USER_GAME_SETTINGS.roundConfig.maxRounds ||
        settings.roundConfig.playingMs !== DEFAULT_USER_GAME_SETTINGS.roundConfig.playingMs ||
        settings.roundConfig.revealMs !== DEFAULT_USER_GAME_SETTINGS.roundConfig.revealMs
      ) {
        await setRoomRoundConfig({
          roomCode,
          playerId: session.playerId,
          maxRounds: settings.roundConfig.maxRounds,
          playingMs: settings.roundConfig.playingMs,
          revealMs: settings.roundConfig.revealMs,
        });
      }
    },
    onSuccess: () => {
      notify.success("Réglages précédents restaurés.");
      snapshotQuery.refetch();
    },
    onError: (error) => {
      rememberedSettingsRestoreAttemptedRef.current = false;
      notify.error("Impossible de restaurer les réglages précédents.", {
        key: `room-play:restore-settings:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  useEffect(() => {
    const isDefaultHostLobby =
      isHost &&
      state?.state === "waiting" &&
      currentRoomSettings !== null &&
      isDefaultRememberedGameSettings(currentRoomSettings);
    if (!isDefaultHostLobby) {
      rememberedSettingsRestoreAttemptedRef.current = false;
      return;
    }
    if (
      rememberedSettingsRestoreAttemptedRef.current ||
      restoreRememberedSettingsMutation.isPending
    ) {
      return;
    }
    const rememberedSettings = loadRememberedGameSettings();
    if (!shouldRestoreRememberedGameSettings(currentRoomSettings, rememberedSettings)) {
      return;
    }
    rememberedSettingsRestoreAttemptedRef.current = true;
    restoreRememberedSettingsMutation.mutate(rememberedSettings!);
  }, [
    currentRoomSettings,
    isHost,
    restoreRememberedSettingsMutation,
    restoreRememberedSettingsMutation.isPending,
    state?.state,
  ]);

  const skipMutation = useMutation({
    mutationFn: () => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return skipRoomRound({
        roomCode,
        playerId: session.playerId,
      });
    },
    onMutate: () => {
      if (!state) return;
      if (state.state !== "playing" && state.state !== "reveal") return;
      setPhaseSkipVote({
        phase: state.state,
        round: state.round,
      });
    },
    onError: (error) => {
      setPhaseSkipVote(null);
      notify.error(skipErrorMessage(error), {
        key: `room-play:skip:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
    onSuccess: (result) => {
      if (!result.accepted) {
        setPhaseSkipVote(null);
      }
      snapshotQuery.refetch();
    },
  });

  const mediaReadyMutation = useMutation({
    mutationFn: (trackId: string) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return markRoomMediaPrepared({
        roomCode,
        playerId: session.playerId,
        trackId,
      });
    },
    onSuccess: (result, trackId) => {
      if (!result.accepted) {
        reportedMediaReadyRef.current = null;
        if (
          state?.state === "loading" &&
          state.media?.provider === "animethemes" &&
          state.media.trackId === trackId
        ) {
          const retryKey = `${state.round}:${trackId}`;
          const previous = mediaReadyRetryRef.current;
          const attempts = previous?.key === retryKey ? previous.attempts + 1 : 1;
          mediaReadyRetryRef.current = { key: retryKey, attempts };
          if (attempts <= MEDIA_READY_RETRY_MAX_ATTEMPTS) {
            if (mediaReadyRetryTimeoutRef.current !== null) {
              window.clearTimeout(mediaReadyRetryTimeoutRef.current);
            }
            mediaReadyRetryTimeoutRef.current = window.setTimeout(() => {
              mediaReadyRetryTimeoutRef.current = null;
              signalAnimeMediaReady();
            }, MEDIA_READY_RETRY_DELAY_MS);
          }
        }
      } else {
        mediaReadyRetryRef.current = null;
      }
      snapshotQuery.refetch();
    },
    onError: () => {
      reportedMediaReadyRef.current = null;
    },
  });

  const answerMutation = useMutation({
    mutationFn: async (value: string) => {
      const result = await submitRoomAnswer({
        roomCode,
        playerId: session.playerId ?? "",
        answer: value,
      });
      if (!result.accepted) {
        throw new Error("ANSWER_NOT_ACCEPTED");
      }
      return result;
    },
    onSuccess: (_result, value) => {
      if (effectivePhase === "playing" && state?.mode === "mcq") {
        setSubmittedMcq({ round: state.round, choice: value });
      }
      if (effectivePhase === "playing" && state?.mode === "text") {
        setSubmittedText({ round: state.round, value });
      }
      snapshotQuery.refetch();
    },
    onError: (error) => {
      setSubmittedMcq(null);
      setSubmittedText(null);
      notify.error(answerErrorMessage(error), {
        key: `room-play:answer:${roomCode}:${state?.round ?? 0}:${errorCode(error) ?? "unknown"}`,
      });
      snapshotQuery.refetch();
    },
  });

  const answerDraftMutation = useMutation({
    mutationFn: (value: string) =>
      submitRoomAnswerDraft({
        roomCode,
        playerId: session.playerId ?? "",
        answer: value,
      }),
  });

  const chatMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!session.playerId) throw new Error("PLAYER_NOT_FOUND");
      return sendRoomChatMessage({
        roomCode,
        playerId: session.playerId,
        text,
      });
    },
    onSuccess: () => {
      setChatInput("");
      snapshotQuery.refetch();
    },
    onError: (error) => {
      if (
        error instanceof HttpStatusError &&
        error.status === 404 &&
        error.message === "ROOM_NOT_FOUND"
      ) {
        if (roomMissingRedirectedRef.current) return;
        roomMissingRedirectedRef.current = true;
        notify.error(roomMissingMessage(), {
          key: `room-play:missing-room:${roomCode}`,
        });
        clearSession();
        navigate({ to: "/" });
        return;
      }
      notify.error(chatErrorMessage(error), {
        key: `room-play:chat:${roomCode}:${errorCode(error) ?? "unknown"}`,
      });
    },
  });

  const startErrorCode = startMutation.error instanceof Error ? startMutation.error.message : null;
  const isNonBlockingStartError =
    startErrorCode === "PLAYERS_LIBRARY_SYNCING" || startErrorCode === "PLAYLIST_TRACKS_RESOLVING";
  const spotifyCooldownRemainingMs = useMemo(() => {
    if (!spotifyRateLimitUntilMs) return 0;
    return Math.max(0, spotifyRateLimitUntilMs - clockNow);
  }, [clockNow, spotifyRateLimitUntilMs]);
  const spotifyCooldownRemainingSec = Math.max(1, Math.ceil(spotifyCooldownRemainingMs / 1000));

  useEffect(() => {
    if (!isNonBlockingStartError) return;
    startMutation.reset();
  }, [isNonBlockingStartError, startMutation]);

  const remainingMs = useMemo(() => {
    if (!effectiveDeadlineMs) return null;
    return effectiveDeadlineMs - clockNow;
  }, [clockNow, effectiveDeadlineMs]);
  const roundMediaKey = `${state?.round ?? 0}:${state?.media?.trackId ?? state?.reveal?.trackId ?? "none"}`;
  const progressKey = `${effectivePhase ?? state?.state ?? "none"}:${state?.round ?? 0}:${effectiveDeadlineMs ?? 0}:${state?.media?.trackId ?? state?.reveal?.trackId ?? "none"}`;

  useEffect(() => {
    if (!state) {
      progressStateRef.current = { key: "", value: 0 };
      postRoundProgressRef.current = null;
      setProgress(0);
      return;
    }

    if (state.state === "reveal" || state.state === "leaderboard") {
      const postKey = `post-round:${roundMediaKey}`;
      if (!postRoundProgressRef.current || postRoundProgressRef.current.key !== postKey) {
        postRoundProgressRef.current = { key: postKey, startedAtMs: clockNow };
      }
      const startedAtMs = postRoundProgressRef.current.startedAtMs;
      const elapsedMs = Math.max(0, clockNow - startedAtMs);
      const rawProgress = clamp01(elapsedMs / (REVEAL_MS + LEADERBOARD_MS));
      const previous = progressStateRef.current;
      const nextProgress =
        previous.key === postKey ? Math.max(previous.value, rawProgress) : rawProgress;

      progressStateRef.current = {
        key: postKey,
        value: nextProgress,
      };
      setProgress(nextProgress);
      return;
    }

    postRoundProgressRef.current = null;
    const rawProgress = phaseProgress(effectivePhase ?? state.state, remainingMs);
    const previous = progressStateRef.current;
    const nextProgress =
      previous.key === progressKey ? Math.max(previous.value, rawProgress) : rawProgress;

    progressStateRef.current = {
      key: progressKey,
      value: nextProgress,
    };
    setProgress(nextProgress);
  }, [effectivePhase, progressKey, remainingMs, state]);

  const youtubePlayback = useMemo(() => {
    if (!state?.media?.embedUrl || !state.media.trackId) return null;
    if (state.media.provider !== "youtube") return null;
    return {
      key: `${state.media.provider}:${state.media.trackId}`,
      embedUrl: state.media.embedUrl,
    };
  }, [state?.media?.embedUrl, state?.media?.provider, state?.media?.trackId]);

  const animeVideoPlayback = useMemo(() => {
    if (!state?.media?.sourceUrl || !state.media.trackId) return null;
    if (state.media.provider !== "animethemes") return null;
    return {
      key: `${state.media.provider}:${state.media.trackId}`,
      sourceUrl: state.media.sourceUrl,
    };
  }, [state?.media?.sourceUrl, state?.media?.provider, state?.media?.trackId]);

  useEffect(() => {
    if (youtubePlayback) {
      setStableYoutubePlayback((previous) => {
        if (previous?.key === youtubePlayback.key) return previous;
        return youtubePlayback;
      });
      return;
    }

    const shouldClear =
      state?.state === "waiting" ||
      state?.state === "playing" ||
      state?.state === "results" ||
      state?.state === undefined;
    if (shouldClear) {
      setStableYoutubePlayback(null);
    }
  }, [state?.state, youtubePlayback]);

  useEffect(() => {
    if (animeVideoPlayback) {
      setStableAnimeVideoPlayback((previous) => {
        if (previous?.key === animeVideoPlayback.key) return previous;
        return animeVideoPlayback;
      });
      return;
    }

    const shouldClear =
      state?.state === "waiting" || state?.state === "results" || state?.state === undefined;
    if (shouldClear) {
      setStableAnimeVideoPlayback(null);
    }
  }, [animeVideoPlayback, state?.state]);

  const activeYoutubeEmbed = stableYoutubePlayback?.embedUrl ?? null;
  const activeAnimeVideoSource = stableAnimeVideoPlayback?.sourceUrl ?? null;
  const usingYouTubePlayback = Boolean(activeYoutubeEmbed);
  const usingAnimeVideoPlayback = Boolean(activeAnimeVideoSource);
  const currentAnimeRoundKey = useMemo(() => {
    if (!state?.media || state.media.provider !== "animethemes") return null;
    return `${state.round}:${state.media.trackId}`;
  }, [state?.media, state?.round]);
  const shouldKeepMediaPlaying = effectivePhase === "playing" || effectivePhase === "reveal";
  const shouldWarmupAnimePlayback =
    effectivePhase === "loading" &&
    state?.state === "loading" &&
    currentAnimeRoundKey !== null &&
    usingAnimeVideoPlayback;
  const revealVideoActive =
    (usingYouTubePlayback || usingAnimeVideoPlayback) &&
    state?.state !== "waiting" &&
    effectivePhase !== "loading" &&
    effectivePhase !== "playing" &&
    state?.state !== "results";
  const isResults = state?.state === "results";
  const isSpectating = Boolean(state?.livesMode && currentPlayer?.isEliminated);
  const hasServerLockedGuess =
    effectivePhase === "playing" && Boolean(currentPlayer?.hasAnsweredCurrentRound);
  const mcqLocked =
    effectivePhase === "playing" &&
    state?.mode === "mcq" &&
    (isSpectating || hasServerLockedGuess || (submittedMcq !== null && submittedMcq.round === state?.round));
  const textLocked =
    effectivePhase === "playing" &&
    state?.mode === "text" &&
    (isSpectating || hasServerLockedGuess || (submittedText !== null && submittedText.round === state?.round));
  const roundLabel = `${state?.round ?? 0}/${state?.totalRounds ?? 0}`;
  const revealArtwork = state?.reveal ? revealArtworkUrl(state.reveal) : null;
  const hasLockedGuessVote =
    effectivePhase === "playing" &&
    phaseSkipVote?.phase === "playing" &&
    phaseSkipVote.round === state?.round;
  const hasLockedRevealVote =
    state?.state === "reveal" &&
    phaseSkipVote?.phase === "reveal" &&
    phaseSkipVote.round === state?.round;
  const skipGuessDisabled =
    skipMutation.isPending ||
    !session.playerId ||
    isSpectating ||
    Boolean(currentPlayer?.hasAnsweredCurrentRound) ||
    hasLockedGuessVote;
  const skipRevealDisabled = skipMutation.isPending || !session.playerId || isSpectating || hasLockedRevealVote;

  function cancelAnimeWarmupVerification() {
    if (animeWarmupRafRef.current !== null) {
      window.cancelAnimationFrame(animeWarmupRafRef.current);
      animeWarmupRafRef.current = null;
    }
    animeWarmupVerificationRef.current = null;
  }

  function markAnimeProgress() {
    animeLastProgressAtRef.current = Date.now();
  }

  function animeBufferedAheadSec(video: HTMLVideoElement) {
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = video.buffered.start(index);
      const end = video.buffered.end(index);
      if (currentTime + 0.25 < start || currentTime > end + 0.25) continue;
      return Math.max(0, end - currentTime);
    }
    return 0;
  }

  function hasEnoughAnimeReadyBuffer(video: HTMLVideoElement) {
    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    return animeBufferedAheadSec(video) >= ANIME_MEDIA_PREPARED_BUFFER_SEC;
  }

  function currentRoundMediaOffsetSec() {
    return Math.max(0, state?.roundSync?.mediaOffsetSec ?? 0);
  }

  function describeMediaElement(media: HTMLMediaElement | null) {
    if (!media) return {};
    return {
      readyState: media.readyState,
      networkState: media.networkState,
      currentTime: Number.isFinite(media.currentTime) ? Number(media.currentTime.toFixed(3)) : null,
      currentSrc: media.currentSrc || media.getAttribute("src") || null,
    };
  }

  function logAnimeDiagnosticOnce(
    level: Parameters<typeof logClientEvent>[0],
    event: string,
    key: string,
    data: Record<string, unknown> = {},
  ) {
    const signature = `${event}:${key}`;
    if (animeDiagnosticsRef.current.has(signature)) return;
    animeDiagnosticsRef.current.add(signature);
    logClientEvent(level, event, {
      roomCode,
      playerId: session.playerId ?? null,
      round: state?.round ?? null,
      phase: state?.state ?? null,
      effectivePhase: effectivePhase ?? null,
      ...data,
    });
  }

  function disposeAnimeVideoElement(
    video: HTMLVideoElement | null,
    reason: string,
    trackKey = currentAnimeRoundKey ?? `${state?.round ?? 0}:${stableAnimeVideoPlayback?.key ?? "none"}`,
  ) {
    if (!video) return;
    cancelAnimeWarmupVerification();
    logAnimeDiagnosticOnce("info", "anime_video_disposed", `${trackKey}:${reason}`, {
      reason,
      ...describeMediaElement(video),
    });
    try {
      video.pause();
    } catch {
      // Ignore pause errors while tearing down a previous round.
    }
    try {
      video.removeAttribute("src");
    } catch {
      // Ignore attribute cleanup errors.
    }
    try {
      video.load();
    } catch {
      // Ignore decoder reset failures.
    }
  }

  function timelinePlaybackTargetSec(nowMs: number) {
    const baseOffsetSec = currentRoundMediaOffsetSec();
    if (effectivePhase === "playing" && effectiveStartedAtMs !== null) {
      return baseOffsetSec + Math.max(0, nowMs - effectiveStartedAtMs) / 1_000;
    }
    if (effectivePhase === "reveal" && effectiveDeadlineMs !== null) {
      const revealStartedAtMs = effectiveDeadlineMs - REVEAL_MS;
      return (
        baseOffsetSec +
        ROUND_MS / 1_000 +
        Math.max(0, nowMs - revealStartedAtMs) / 1_000
      );
    }
    return baseOffsetSec;
  }

  function syncMediaElementToTimeline(
    media: HTMLMediaElement | null,
    nowMs = Date.now() + serverClockOffsetMs,
  ) {
    if (!media) return;

    const rawTargetSec = timelinePlaybackTargetSec(nowMs);
    const duration =
      typeof media.duration === "number" && Number.isFinite(media.duration)
        ? Math.max(0, media.duration)
        : null;
    const targetSec =
      duration === null ? rawTargetSec : Math.min(rawTargetSec, Math.max(0, duration - 0.25));

    try {
      if (Math.abs(media.currentTime - targetSec) > 0.45) {
        media.currentTime = targetSec;
      }
    } catch {
      // Ignore seek errors while metadata or a segmented response is still settling.
    }
  }

  function handleAnimePlaybackIssue() {
    setAudioError(true);
    setAnimePlaybackStatus("buffering");
  }

  function retryAnimeMediaLoad(trackKey: string) {
    const video = animeVideoRef.current;
    if (!video || !activeAnimeVideoSource) return false;

    const previousAttempt =
      animeReloadAttemptRef.current?.key === trackKey ? animeReloadAttemptRef.current.count : 0;
    if (previousAttempt >= 1) return false;

    animeReloadAttemptRef.current = {
      key: trackKey,
      count: previousAttempt + 1,
    };
    cancelAnimeWarmupVerification();
    animeWarmupVerifiedKeyRef.current = null;
    reportedMediaReadyRef.current = null;
    setAudioError(false);
    setAnimePlaybackStatus("buffering");
    logAnimeDiagnosticOnce("warn", "anime_video_soft_reload", trackKey, {
      attempt: previousAttempt + 1,
      sourceUrl: activeAnimeVideoSource,
      ...describeMediaElement(video),
    });

    disposeAnimeVideoElement(video, "soft_reload", trackKey);
    video.src = activeAnimeVideoSource;
    video.load();

    return true;
  }

  function signalAnimeMediaReady() {
    if (!state?.media || state.media.provider !== "animethemes") return;
    if (state.state !== "loading") return;
    if (!session.playerId) return;
    if (mediaReadyMutation.isPending) return;

    const readyKey = `${state.round}:${state.media.trackId}`;
    if (animeWarmupVerifiedKeyRef.current !== readyKey) return;
    if (reportedMediaReadyRef.current === readyKey) return;
    reportedMediaReadyRef.current = readyKey;
    mediaReadyMutation.mutate(state.media.trackId);
  }

  function verifyAnimeWarmupPlayback(trackKey: string) {
    if (animeWarmupRafRef.current !== null) return;
    const tick = () => {
      const video = animeVideoRef.current;
      const verification = animeWarmupVerificationRef.current;
      if (!video || !verification || verification.key !== trackKey) {
        cancelAnimeWarmupVerification();
        return;
      }
      if (animeWarmupVerifiedKeyRef.current === trackKey) {
        cancelAnimeWarmupVerification();
        return;
      }
      const advancedSec = Math.max(0, video.currentTime - verification.baselineSec);
      if (advancedSec >= ANIME_MEDIA_VERIFIED_START_ADVANCE_SEC) {
        animeWarmupVerifiedKeyRef.current = trackKey;
        cancelAnimeWarmupVerification();
        video.pause();
        syncMediaElementToTimeline(video);
        setAnimePlaybackStatus("ready");
        markAnimeProgress();
        signalAnimeMediaReady();
        return;
      }
      if (Date.now() - verification.startedAtMs >= ANIME_MEDIA_WARMUP_VERIFY_TIMEOUT_MS) {
        const elapsedMs = Math.max(0, Date.now() - verification.startedAtMs);
        const didRetry = retryAnimeMediaLoad(trackKey);
        logAnimeDiagnosticOnce("warn", "anime_video_warmup_verify_timeout", trackKey, {
          advancedSec: Number(advancedSec.toFixed(3)),
          elapsedMs,
          didRetry,
          ...describeMediaElement(video),
        });
        if (!didRetry) {
          cancelAnimeWarmupVerification();
          setAnimePlaybackStatus("buffering");
        }
        return;
      }
      animeWarmupRafRef.current = window.requestAnimationFrame(tick);
    };
    animeWarmupRafRef.current = window.requestAnimationFrame(tick);
  }

  function tryStartAnimeWarmup(video: HTMLVideoElement | null) {
    if (!video || !currentAnimeRoundKey || !shouldWarmupAnimePlayback) return false;
    if (animeWarmupVerifiedKeyRef.current === currentAnimeRoundKey) {
      setAnimePlaybackStatus("ready");
      return true;
    }
    if (!hasEnoughAnimeReadyBuffer(video)) {
      logAnimeDiagnosticOnce("info", "anime_video_warmup_waiting_for_buffer", currentAnimeRoundKey, {
        bufferedAheadSec: Number(animeBufferedAheadSec(video).toFixed(3)),
        ...describeMediaElement(video),
      });
      setAnimePlaybackStatus("buffering");
      return false;
    }
    if (animeWarmupVerificationRef.current?.key === currentAnimeRoundKey) {
      setAnimePlaybackStatus("warming");
      return true;
    }
    syncMediaElementToTimeline(video);
    const baselineSec = Number.isFinite(video.currentTime)
      ? video.currentTime
      : currentRoundMediaOffsetSec();
    cancelAnimeWarmupVerification();
    animeWarmupVerificationRef.current = {
      key: currentAnimeRoundKey,
      baselineSec,
      startedAtMs: Date.now(),
    };
    video.muted = true;
    video.defaultMuted = true;
    setAnimePlaybackStatus("warming");
    markAnimeProgress();
    const startVerification = () => {
      verifyAnimeWarmupPlayback(currentAnimeRoundKey);
    };
    try {
      const playPromise = video.play();
      if (playPromise) {
        playPromise.then(startVerification).catch((error) => {
          console.error("anime_video_warmup_failed", error);
          logAnimeDiagnosticOnce("warn", "anime_video_warmup_play_failed", currentAnimeRoundKey, {
            error: error instanceof Error ? error.message : String(error),
            ...describeMediaElement(video),
          });
          cancelAnimeWarmupVerification();
          handleAnimePlaybackIssue();
        });
      } else {
        startVerification();
      }
    } catch (error) {
      console.error("anime_video_warmup_failed", error);
      logAnimeDiagnosticOnce("warn", "anime_video_warmup_play_failed", currentAnimeRoundKey, {
        error: error instanceof Error ? error.message : String(error),
        ...describeMediaElement(video),
      });
      cancelAnimeWarmupVerification();
      handleAnimePlaybackIssue();
      return false;
    }
    return true;
  }

  function handleAnimeLoadedMetadata() {
    const video = animeVideoRef.current;
    if (!video) return;
    setAnimePlaybackStatus("buffering");
    syncMediaElementToTimeline(video);
    markAnimeProgress();
  }

  function handleAnimeLoadedData() {
    const video = animeVideoRef.current;
    if (video) {
      syncMediaElementToTimeline(video);
      tryStartAnimeWarmup(video);
    }
    markAnimeProgress();
  }

  function handleAnimeCanPlay() {
    const video = animeVideoRef.current;
    if (video) {
      syncMediaElementToTimeline(video);
      tryStartAnimeWarmup(video);
    }
    markAnimeProgress();
  }

  function handleAnimePlaying() {
    const video = animeVideoRef.current;
    if (video && !shouldWarmupAnimePlayback) {
      video.muted = false;
      video.defaultMuted = false;
      syncMediaElementToTimeline(video);
    }
    setAnimePlaybackStatus(shouldWarmupAnimePlayback ? "warming" : "playing");
    markAnimeProgress();
  }

  function handleAnimeWaiting() {
    setAnimePlaybackStatus("buffering");
  }

  useEffect(() => {
    if (!phaseSkipVote) return;
    if (!state) {
      setPhaseSkipVote(null);
      return;
    }
    if (
      (effectivePhase ?? state.state) !== phaseSkipVote.phase ||
      state.round !== phaseSkipVote.round ||
      ((effectivePhase ?? state.state) !== "playing" && state.state !== "reveal")
    ) {
      setPhaseSkipVote(null);
    }
  }, [effectivePhase, phaseSkipVote, state]);

  useEffect(() => {
    animeDiagnosticsRef.current.clear();
  }, [state?.round, state?.media?.trackId, state?.reveal?.trackId]);

  useEffect(() => {
    reportedMediaReadyRef.current = null;
    animeLongLoadToastRef.current = null;
    animeReloadAttemptRef.current = null;
    mediaReadyRetryRef.current = null;
    animeWarmupVerifiedKeyRef.current = null;
    cancelAnimeWarmupVerification();
    setAudioError(false);
    if (mediaReadyRetryTimeoutRef.current !== null) {
      window.clearTimeout(mediaReadyRetryTimeoutRef.current);
      mediaReadyRetryTimeoutRef.current = null;
    }
    if (state?.state === "loading" && state.media?.provider === "animethemes") {
      setAnimePlaybackStatus("buffering");
      animeLastProgressAtRef.current = Date.now();
    } else {
      setAnimePlaybackStatus("idle");
      animeLastProgressAtRef.current = null;
    }
  }, [state?.state, state?.round, state?.media?.trackId]);

  useEffect(() => {
    const iframe = youtubeIframeRef.current;
    if (!iframe || !activeYoutubeEmbed) return;
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) return;
    const iframeId = `kwizik-youtube-${stableYoutubePlayback?.key ?? "unknown"}`;
    iframe.id = iframeId;

    const subscribe = () => {
      const baseEvent = { id: iframeId, channel: "widget" };
      iframeWindow.postMessage(JSON.stringify({ event: "listening", ...baseEvent }), "*");
      iframeWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: "addEventListener",
          args: ["onError"],
          ...baseEvent,
        }),
        "*",
      );
    };
    subscribe();
    const subscribeInterval = window.setInterval(subscribe, 1_000);

    function onMessage(event: MessageEvent) {
      if (event.source !== iframeWindow) return;
      if (typeof event.origin !== "string" || !event.origin.includes("youtube.com")) return;
      if (typeof event.data !== "string") return;

      try {
        const payload = JSON.parse(event.data) as { event?: string; info?: unknown };
        if (payload.event !== "onError") return;
        const code = Number(payload.info);
        if (![2, 5, 100, 101, 150].includes(code)) return;
        setAudioError(true);
      } catch {
        // Ignore non-JSON postMessage payloads.
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(subscribeInterval);
      window.removeEventListener("message", onMessage);
    };
  }, [activeYoutubeEmbed, stableYoutubePlayback?.key]);

  useEffect(() => {
    const video = animeVideoRef.current;
    if (!video) return;

    if (!activeAnimeVideoSource) {
      disposeAnimeVideoElement(video, "source_cleared");
      animeWarmupVerifiedKeyRef.current = null;
      reportedMediaReadyRef.current = null;
      setAnimePlaybackStatus("idle");
      return;
    }

    reportedMediaReadyRef.current = null;
    setAnimePlaybackStatus("buffering");
    animeLastProgressAtRef.current = Date.now();
    if (shouldWarmupAnimePlayback) {
      video.muted = true;
      video.defaultMuted = true;
    } else {
      video.muted = false;
      video.defaultMuted = false;
    }
    syncMediaElementToTimeline(video);
  }, [activeAnimeVideoSource, shouldWarmupAnimePlayback, stableAnimeVideoPlayback?.key]);

  useEffect(() => {
    const video = animeVideoRef.current;
    const trackKey = `${state?.round ?? 0}:${stableAnimeVideoPlayback?.key ?? "none"}`;
    return () => {
      disposeAnimeVideoElement(video, "track_change", trackKey);
    };
  }, [stableAnimeVideoPlayback?.key, state?.round]);

  useEffect(() => {
    const video = animeVideoRef.current;
    if (!video || !activeAnimeVideoSource) return;

    function onProgress() {
      markAnimeProgress();
      tryStartAnimeWarmup(video);
    }

    video.addEventListener("progress", onProgress);
    return () => {
      video.removeEventListener("progress", onProgress);
    };
  }, [
    activeAnimeVideoSource,
    currentAnimeRoundKey,
    shouldWarmupAnimePlayback,
    stableAnimeVideoPlayback?.key,
  ]);

  useEffect(() => {
    const video = animeVideoRef.current;
    if (!video || !activeAnimeVideoSource) return;
    if (shouldWarmupAnimePlayback) {
      tryStartAnimeWarmup(video);
      return;
    }
    cancelAnimeWarmupVerification();
    video.muted = false;
    video.defaultMuted = false;
    syncMediaElementToTimeline(video);
    if (!shouldKeepMediaPlaying) {
      video.pause();
      return;
    }
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch((error) => {
        console.error("anime_video_play_failed", error);
        logAnimeDiagnosticOnce("warn", "anime_video_play_failed", currentAnimeRoundKey ?? "none", {
          error: error instanceof Error ? error.message : String(error),
          ...describeMediaElement(video),
        });
        handleAnimePlaybackIssue();
      });
    }
  }, [
    activeAnimeVideoSource,
    shouldKeepMediaPlaying,
    shouldWarmupAnimePlayback,
    stableAnimeVideoPlayback?.key,
  ]);

  useEffect(() => {
    if (!shouldKeepMediaPlaying || !activeAnimeVideoSource) return;
    const intervalId = window.setInterval(() => {
      syncMediaElementToTimeline(animeVideoRef.current);
    }, 1_250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    activeAnimeVideoSource,
    shouldKeepMediaPlaying,
    effectiveStartedAtMs,
    effectiveDeadlineMs,
    serverClockOffsetMs,
    state?.roundSync?.mediaOffsetSec,
  ]);

  useEffect(() => {
    const activeProvider = state?.media?.provider ?? state?.reveal?.provider ?? null;
    if (!audioError) {
      lastAudioErrorToastRef.current = null;
      return;
    }
    if (activeProvider === "animethemes") {
      return;
    }
    const trackId = state?.media?.trackId ?? state?.reveal?.trackId ?? "unknown";
    const key = `room-play:playback-error:${roomCode}:${state?.state ?? "unknown"}:${trackId}:${activeProvider ?? "preview"}`;
    if (lastAudioErrorToastRef.current === key) return;
    lastAudioErrorToastRef.current = key;
    notify.error(
      activeProvider === "youtube"
        ? "Lecture video impossible pour cette manche."
        : "Erreur audio: extrait indisponible.",
      { key },
    );
  }, [
    audioError,
    effectivePhase,
    roomCode,
    state?.media?.provider,
    state?.media?.trackId,
    state?.reveal?.provider,
    state?.reveal?.trackId,
    state?.state,
  ]);

  useEffect(() => {
    if (!session.playerId) return;
    if (state?.state !== "loading") return;
    if (!state.media || state.media.provider !== "animethemes") return;
    if (!usingAnimeVideoPlayback) return;
    if (animePlaybackStatus === "ready" || animePlaybackStatus === "playing") return;
    const trackKey = `${state.round}:${state.media.trackId}`;
    const intervalId = window.setInterval(() => {
      const lastProgressAtMs = animeLastProgressAtRef.current ?? Date.now();
      const stalledForMs = Math.max(0, Date.now() - lastProgressAtMs);
      const retryCount =
        animeReloadAttemptRef.current?.key === trackKey ? animeReloadAttemptRef.current.count : 0;
      if (
        stalledForMs >= ANIME_MEDIA_LONG_LOAD_TOAST_MS &&
        animeLongLoadToastRef.current !== trackKey
      ) {
        animeLongLoadToastRef.current = trackKey;
        notify.info("Chargement du theme plus long que prevu...", {
          key: `room-play:anime-long-load:${roomCode}:${trackKey}`,
        });
      }
      if (stalledForMs >= ANIME_MEDIA_SOFT_RETRY_TIMEOUT_MS && retryCount < 1) {
        const didRetry = retryAnimeMediaLoad(trackKey);
        if (didRetry) {
          notify.info("Chargement du theme toujours en cours, nouvelle tentative...", {
            key: `room-play:anime-retry:${roomCode}:${trackKey}`,
          });
        }
      }
    }, 1_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    animePlaybackStatus,
    session.playerId,
    state?.media?.provider,
    state?.media?.trackId,
    state?.round,
    state?.state,
    usingAnimeVideoPlayback,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioRetryTimeoutRef.current !== null) {
      window.clearTimeout(audioRetryTimeoutRef.current);
      audioRetryTimeoutRef.current = null;
    }

    if (activeYoutubeEmbed || activeAnimeVideoSource) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      lastPreviewRef.current = null;
      return;
    }

    const previewUrl = state?.previewUrl ?? null;
    if (!previewUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      lastPreviewRef.current = null;
      return;
    }

    setAudioError(false);
    if (lastPreviewRef.current !== previewUrl) {
      lastPreviewRef.current = previewUrl;
      audio.src = previewUrl;
      audio.currentTime = 0;
    }

    syncMediaElementToTimeline(audio);
    if (!shouldKeepMediaPlaying) {
      audio.pause();
      return;
    }

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        if (audioRetryTimeoutRef.current !== null) return;
        audioRetryTimeoutRef.current = window.setTimeout(() => {
          audioRetryTimeoutRef.current = null;
          const nextAudio = audioRef.current;
          if (!nextAudio || !nextAudio.src) return;
          nextAudio.play().catch(() => undefined);
        }, 320);
      });
    }
  }, [
    activeAnimeVideoSource,
    activeYoutubeEmbed,
    shouldKeepMediaPlaying,
    state?.previewUrl,
  ]);

  useEffect(() => {
    function unlockAudioPlayback() {
      const shouldKickIframe = Boolean(activeYoutubeEmbed) && !userInteractionUnlockedRef.current;
      userInteractionUnlockedRef.current = true;
      const canAutoPlayMedia = shouldKeepMediaPlaying || shouldWarmupAnimePlayback;

      const audio = audioRef.current;
      if (audio && audio.src && canAutoPlayMedia) {
        audio.play().catch(() => undefined);
      }
      const video = animeVideoRef.current;
      if (video && activeAnimeVideoSource && canAutoPlayMedia) {
        if (shouldWarmupAnimePlayback) {
          tryStartAnimeWarmup(video);
        } else {
          video.play().catch(() => undefined);
        }
      }
      if (shouldKickIframe) {
        setIframeEpoch((value) => value + 1);
      }
    }

    window.addEventListener("pointerdown", unlockAudioPlayback, { passive: true });
    window.addEventListener("keydown", unlockAudioPlayback);

    return () => {
      window.removeEventListener("pointerdown", unlockAudioPlayback);
      window.removeEventListener("keydown", unlockAudioPlayback);
    };
  }, [
    activeAnimeVideoSource,
    activeYoutubeEmbed,
    shouldKeepMediaPlaying,
    shouldWarmupAnimePlayback,
  ]);

  useEffect(() => {
    return () => {
      if (audioRetryTimeoutRef.current !== null) {
        window.clearTimeout(audioRetryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    if (effectivePhase !== "playing") {
      setSubmittedMcq(null);
      setSubmittedText(null);
      return;
    }

    if (state.mode === "mcq" && submittedMcq && submittedMcq.round !== state.round) {
      setSubmittedMcq(null);
    }
    if (state.mode === "text" && submittedText && submittedText.round !== state.round) {
      setSubmittedText(null);
      setAnswer("");
    }
  }, [effectivePhase, state, submittedMcq, submittedText]);

  useEffect(() => {
    if (!state || state.round <= 0) return;
    setAnswer("");
  }, [state?.round]);

  useEffect(() => {
    if (
      !state ||
      effectivePhase !== "playing" ||
      state.mode !== "text" ||
      !session.playerId ||
      textLocked
    ) {
      draftSignatureRef.current = null;
      return;
    }

    const value = answer.trim().slice(0, 80);
    const signature = `${state.round}:${value}`;
    if (draftSignatureRef.current === signature) return;
    draftSignatureRef.current = signature;

    const timeoutId = window.setTimeout(() => {
      answerDraftMutation.mutate(value);
    }, 90);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [answer, answerDraftMutation, effectivePhase, session.playerId, state, textLocked]);

  useEffect(() => {
    if (!state || effectivePhase !== "playing" || state.mode !== "text") {
      autoSubmitSignatureRef.current = null;
      return;
    }
    if (!session.playerId || textLocked || answerMutation.isPending || effectiveDeadlineMs === null)
      return;

    const value = answer.trim();
    if (!value) return;

    const remainingMs = effectiveDeadlineMs - clockNow;
    if (remainingMs > 220 || remainingMs < -700) return;

    const signature = `${state.round}:${value.toLowerCase()}`;
    if (autoSubmitSignatureRef.current === signature) return;
    autoSubmitSignatureRef.current = signature;

    answerMutation.mutate(value);
  }, [answer, answerMutation, clockNow, effectiveDeadlineMs, effectivePhase, session.playerId, state, textLocked]);

  function onSubmitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || effectivePhase !== "playing" || state.mode !== "text") return;
    if (textLocked) return;

    const value = answer.trim();
    if (!value || !session.playerId) return;
    autoSubmitSignatureRef.current = `${state.round}:${value.toLowerCase()}`;
    answerMutation.mutate(value);
  }

  function onSelectChoice(choice: string) {
    if (!state || effectivePhase !== "playing" || state.mode !== "mcq") return;
    if (!session.playerId || mcqLocked) return;
    answerMutation.mutate(choice);
  }

  function onSubmitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.playerId) return;
    const value = chatInput.trim();
    if (value.length <= 0) return;
    chatMutation.mutate(value);
  }

  useEffect(() => {
    if (!chatLogRef.current || !chatEndRef.current) return;
    chatEndRef.current.scrollIntoView({ block: "end", behavior: "auto" });
  }, [chatMessages.length]);

  function onSelectSourceMode(mode: SourceMode) {
    setSourceMode(mode);
    sourceModeMutation.mutate(mode);
  }

  function onSelectThemeMode(mode: ThemeMode) {
    setThemeMode(mode);
    themeModeMutation.mutate(mode);
  }

  function onSelectDifficultyFilter(filter: DifficultyFilter) {
    setDifficultyFilter(filter);
    difficultyFilterMutation.mutate(filter);
  }

  function onToggleContentDecade(decade: number) {
    const nextFilters: RoomContentFilters = {
      decades: contentFilters.decades.includes(decade)
        ? contentFilters.decades.filter((value) => value !== decade)
        : [...contentFilters.decades, decade].sort((left, right) => left - right),
      genres: contentFilters.genres,
    };
    setContentFilters(nextFilters);
    contentFiltersMutation.mutate(nextFilters);
  }

  function onToggleContentGenre(genre: string) {
    const nextFilters: RoomContentFilters = {
      decades: contentFilters.decades,
      genres: contentFilters.genres.includes(genre)
        ? contentFilters.genres.filter((value) => value !== genre)
        : [...contentFilters.genres, genre],
    };
    setContentFilters(nextFilters);
    contentFiltersMutation.mutate(nextFilters);
  }

  function onSelectLivesPreset(preset: LivesPreset) {
    setLivesMode(preset > 0);
    if (preset > 0) {
      setMaxLives(preset);
    }
    livesMutation.mutate(preset);
  }

  function onSelectAnswerMode(mode: AnswerMode) {
    setAnswerMode(mode);
    answerModeMutation.mutate(mode);
  }

  function onSelectMaxRounds(value: number) {
    setMaxRounds(value);
    roundConfigMutation.mutate({ maxRounds: value });
  }

  function onSelectPlayingMs(value: number) {
    setPlayingMs(value);
    roundConfigMutation.mutate({ playingMs: value });
  }

  function onSelectRevealMs(value: number) {
    setRevealMs(value);
    roundConfigMutation.mutate({ revealMs: value });
  }

  function dispatchLeaveSignal() {
    if (leaveSentRef.current || !session.playerId) return;
    leaveSentRef.current = true;

    const payload = JSON.stringify({
      roomCode,
      playerId: session.playerId,
    });

    const envBase = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
    const baseUrl =
      envBase.length > 0 ? envBase.replace(/\/+$/, "") : `${window.location.origin}/api`;
    const target = `${baseUrl}/quiz/leave`;

    try {
      const blob = new Blob([payload], { type: "application/json" });
      const sent = navigator.sendBeacon(target, blob);
      if (sent) return;
    } catch {
      // Fall through to fetch keepalive fallback.
    }

    fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "include",
    }).catch(() => undefined);
  }

  useEffect(() => {
    if (!session.playerId) return;
    leaveSentRef.current = false;
    const shouldDispatchOnCleanup = !import.meta.env.DEV;

    function onPageHide() {
      dispatchLeaveSignal();
    }
    function onBeforeUnload() {
      dispatchLeaveSignal();
    }

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (shouldDispatchOnCleanup) {
        dispatchLeaveSignal();
      }
    };
  }, [roomCode, session.playerId]);

  async function leaveRoom() {
    if (session.playerId) {
      leaveSentRef.current = true;
    }
    if (session.playerId) {
      try {
        await leaveRoomApi({ roomCode, playerId: session.playerId });
      } catch {
        dispatchLeaveSignal();
      }
    }
    notify.info("Tu as quitte la room.");
    clearSession();
    navigate({ to: "/" });
  }

  const topThree = (state?.leaderboard ?? []).slice(0, 3);
  const podiumByRank = new Map(topThree.map((entry) => [entry.rank, entry]));
  const podiumSlots = [
    { rank: 2, tone: "silver" as const, entry: podiumByRank.get(2) ?? null },
    { rank: 1, tone: "gold" as const, entry: podiumByRank.get(1) ?? null },
    { rank: 3, tone: "bronze" as const, entry: podiumByRank.get(3) ?? null },
  ];

  return (
    <section className="blindtest-stage">
      <article className={`stage-main arena-layout${isResults ? " results-fullscreen" : ""}`}>
        {!isResults && (
          <aside className="arena-side leaderboard-side">
            <h2 className="side-title">Classement live</h2>
            {state?.leaderboard && state.leaderboard.length > 0 ? (
              <ol className="leaderboard-list compact">
                {state.leaderboard.map((entry) => (
                  <li
                    key={entry.playerId}
                    className={`${entry.hasAnsweredCurrentRound ? "answered" : ""}${entry.isEliminated ? " eliminated" : ""}`}
                  >
                    <span>#{entry.rank}</span>
                    <div className="leaderboard-player-block">
                      <strong className="leaderboard-name">
                        {entry.displayName}
                        {entry.hasAnsweredCurrentRound && (
                          <i className="answer-check" aria-label="Reponse validee">
                            ✓
                          </i>
                        )}
                      </strong>
                      {state.livesMode && (
                        <small className={`leaderboard-lives${entry.isEliminated ? " eliminated" : ""}`}>
                          {renderLivesHearts(entry.lives, state.maxLives)}
                          {entry.isEliminated && <span> Spectateur</span>}
                        </small>
                      )}
                      {showRevealAnswersInLeaderboard &&
                        (() => {
                          const revealAnswer = revealAnswerByPlayerId.get(entry.playerId);
                          if (!revealAnswer) return null;
                          const label =
                            revealAnswer.submitted && revealAnswer.answer
                              ? withRomajiLabel(revealAnswer.answer)
                              : "Pas de réponse";
                          return (
                            <small
                              className={`leaderboard-reveal-answer${revealAnswer.isCorrect ? " correct" : revealAnswer.submitted ? " wrong" : ""}`}
                            >
                              {label}
                            </small>
                          );
                        })()}
                    </div>
                    <div className="leaderboard-score-block">
                      <em>{entry.score} pts</em>
                      <small className="leaderboard-meta">
                        <span className="round-gain">+{entry.lastRoundScore}</span>
                        <span className={`streak-chip${entry.streak > 0 ? " hot" : ""}`}>
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M12 2c.5 3-2 4.8-2 7.2 0 1.5 1 2.7 2 3.4 1.1-.7 2-2 2-3.6 0-1.8-1-3.1-2-4.6 2 .8 4.8 3.4 4.8 7.1A4.8 4.8 0 0 1 12 20a4.8 4.8 0 0 1-4.8-4.9C7.2 10.6 10.1 7.8 12 2Z" />
                          </svg>
                          {entry.streak}
                        </span>
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="status">Le classement s’affiche dès que des joueurs sont présents.</p>
            )}
          </aside>
        )}

        <div className={`gameplay-center${isResults ? " results-compact" : ""}`}>
          {!isResults && (
            <>
              <div className="round-strip">
                <span>Room {roomCode}</span>
                <strong>Manche {roundLabel}</strong>
                {state?.livesMode && currentPlayer && (
                  <em className={`round-strip-lives${currentPlayer.isEliminated ? " eliminated" : ""}`}>
                    {renderLivesHearts(currentPlayer.lives, state.maxLives)}
                  </em>
                )}
              </div>

              <div
                className={`sound-visual media-shell${revealVideoActive ? " reveal-active" : ""}`}
              >
                {activeAnimeVideoSource && (
                  <video
                    ref={animeVideoRef}
                    key={stableAnimeVideoPlayback?.key ?? "none"}
                    className="media-video-layer anime-video-layer"
                    src={activeAnimeVideoSource}
                    preload="auto"
                    playsInline
                    onLoadedMetadata={handleAnimeLoadedMetadata}
                    onLoadedData={handleAnimeLoadedData}
                    onCanPlay={handleAnimeCanPlay}
                    onPlaying={handleAnimePlaying}
                    onWaiting={handleAnimeWaiting}
                    onStalled={handleAnimeWaiting}
                    onError={handleAnimePlaybackIssue}
                  />
                )}
                {activeYoutubeEmbed && (
                  <iframe
                    ref={youtubeIframeRef}
                    key={`${stableYoutubePlayback?.key ?? "none"}|${iframeEpoch}`}
                    className="media-video-layer youtube-video-layer"
                    src={activeYoutubeEmbed}
                    title="Blindtest playback"
                    allow="autoplay; encrypted-media"
                    onError={() => {
                      setAudioError(true);
                    }}
                  />
                )}
                <div className="media-wave-layer" aria-hidden="true">
                  <div
                    className={`wave-bars${usingAnimeVideoPlayback ? " wave-bars-fallback" : ""}`}
                  >
                    {WAVE_BARS.map((bar) => (
                      <span
                        key={bar.key}
                        style={{
                          height: `${bar.heightPercent}%`,
                          animationDelay: `${bar.delaySec}s`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="sound-timeline">
                    <span style={{ width: `${(progress * 100).toFixed(3)}%` }} />
                  </div>
                </div>
                {effectivePhase === "loading" && usingAnimeVideoPlayback && (
                  <div className="media-loading-overlay" role="status" aria-live="polite">
                    <span className="resolving-tracks-spinner" aria-hidden="true" />
                    <p>Chargement de la video...</p>
                    <small>
                      {animePlaybackStatus === "ready"
                        ? "Pret localement, synchronisation de la room..."
                        : animePlaybackStatus === "warming"
                          ? "Verification locale du demarrage..."
                          : animePlaybackStatus === "playing"
                            ? "Lecture demarree"
                            : "Buffering en cours"}
                    </small>
                    <small>
                      {state?.mediaReadyCount ?? 0}/{state?.mediaReadyTotalCount ?? 0} pret
                      {(state?.mediaReadyTotalCount ?? 0) > 1 ? "s" : ""}
                    </small>
                  </div>
                )}
              </div>
            </>
          )}

          {state?.state === "waiting" && (
            <div className="waiting-box">
              <h2>Le host peut lancer la partie quand il le souhaite.</h2>
              {(isResolvingTracks || isPlayersLikedPoolBuilding) && (
                <div className="resolving-tracks-banner" role="status" aria-live="polite">
                  <span className="resolving-tracks-spinner" aria-hidden="true" />
                  <div>
                    <strong>Résolution des sources audio en cours...</strong>
                    <p className="status">Préparation de la playlist des joueurs...</p>
                  </div>
                </div>
              )}

              {isHost ? (
                <div className="field-block">
                  <span className="field-label">Mode source (host)</span>
                  <div className="source-preset-grid">
                    <button
                      type="button"
                      className={`source-preset-btn${sourceMode === "anilist_union" ? " active" : ""}`}
                      onClick={() => onSelectSourceMode("anilist_union")}
                    >
                      <strong>AniList synchronise</strong>
                      <span>Union des listes des joueurs connectés</span>
                    </button>
                    <button
                      type="button"
                      className={`source-preset-btn${sourceMode === "random_classic" ? " active" : ""}`}
                      onClick={() => onSelectSourceMode("random_classic")}
                    >
                      <strong>Blindtest aléatoire classique</strong>
                      <span>Tirage anime global frais à chaque partie</span>
                    </button>
                  </div>

                  {sourceMode === "anilist_union" && (
                    <div className="panel-form">
                      <p className="status">
                        Les bibliotheques AniList synchronisees des joueurs sont utilisees
                        automatiquement.
                      </p>
                    </div>
                  )}

                  <div className="field-block">
                    <span className="field-label">Mode thèmes</span>
                    <div className="source-preset-grid">
                      <button
                        type="button"
                        className={`source-preset-btn${themeMode === "op_only" ? " active" : ""}`}
                        onClick={() => onSelectThemeMode("op_only")}
                      >
                        <strong>OP only</strong>
                        <span>Openings uniquement</span>
                      </button>
                      <button
                        type="button"
                        className={`source-preset-btn${themeMode === "ed_only" ? " active" : ""}`}
                        onClick={() => onSelectThemeMode("ed_only")}
                      >
                        <strong>ED only</strong>
                        <span>Endings uniquement</span>
                      </button>
                      <button
                        type="button"
                        className={`source-preset-btn${themeMode === "mix" ? " active" : ""}`}
                        onClick={() => onSelectThemeMode("mix")}
                      >
                        <strong>Mix</strong>
                        <span>Openings + Endings</span>
                      </button>
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Difficulte AniList</span>
                    <div className="source-preset-grid source-preset-grid-four">
                      <button
                        type="button"
                        className={`source-preset-btn${difficultyFilter === "easy" ? " active" : ""}`}
                        onClick={() => onSelectDifficultyFilter("easy")}
                      >
                        <strong>Facile</strong>
                        <span>Hits tres populaires</span>
                      </button>
                      <button
                        type="button"
                        className={`source-preset-btn${difficultyFilter === "medium" ? " active" : ""}`}
                        onClick={() => onSelectDifficultyFilter("medium")}
                      >
                        <strong>Moyen</strong>
                        <span>Popularite intermediaire</span>
                      </button>
                      <button
                        type="button"
                        className={`source-preset-btn${difficultyFilter === "hard" ? " active" : ""}`}
                        onClick={() => onSelectDifficultyFilter("hard")}
                      >
                        <strong>Difficile</strong>
                        <span>Series plus niche</span>
                      </button>
                      <button
                        type="button"
                        className={`source-preset-btn${difficultyFilter === "all" ? " active" : ""}`}
                        onClick={() => onSelectDifficultyFilter("all")}
                      >
                        <strong>Tous</strong>
                        <span>Aucun filtre de popularite</span>
                      </button>
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Décennies</span>
                    <div className="source-preset-grid source-preset-grid-four">
                      {CONTENT_FILTER_DECADES.map((entry) => (
                        <button
                          key={entry.start}
                          type="button"
                          className={`source-preset-btn${contentFilters.decades.includes(entry.start) ? " active" : ""}`}
                          onClick={() => onToggleContentDecade(entry.start)}
                        >
                          <strong>{entry.label}</strong>
                          <span>{entry.start}-{entry.start + 9}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Genres</span>
                    <div className="source-preset-grid source-preset-grid-three">
                      {CONTENT_FILTER_GENRES.map((genre) => (
                        <button
                          key={genre}
                          type="button"
                          className={`source-preset-btn${contentFilters.genres.includes(genre) ? " active" : ""}`}
                          onClick={() => onToggleContentGenre(genre)}
                        >
                          <strong>{genre}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Mode vies</span>
                    <div className="source-preset-grid source-preset-grid-five">
                      {LIVES_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`source-preset-btn${(preset === 0 ? !livesMode : livesMode && maxLives === preset) ? " active" : ""}`}
                          onClick={() => onSelectLivesPreset(preset)}
                        >
                          <strong>{livesPresetLabel(preset)}</strong>
                          <span>
                            {preset > 0 ? "Elimination a zero vie" : "Score classique"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Nombre de rounds</span>
                    <div className="source-preset-grid">
                      {[5, 10, 15, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`source-preset-btn${maxRounds === n ? " active" : ""}`}
                          onClick={() => onSelectMaxRounds(n)}
                        >
                          <strong>{n}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Durée de devinette</span>
                    <div className="source-preset-grid">
                      {([
                        [10_000, "10s"],
                        [15_000, "15s"],
                        [20_000, "20s"],
                        [30_000, "30s"],
                      ] as const).map(([ms, label]) => (
                        <button
                          key={ms}
                          type="button"
                          className={`source-preset-btn${playingMs === ms ? " active" : ""}`}
                          onClick={() => onSelectPlayingMs(ms)}
                        >
                          <strong>{label}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Durée de révélation</span>
                    <div className="source-preset-grid">
                      {([
                        [5_000, "5s"],
                        [10_000, "10s"],
                        [15_000, "15s"],
                        [20_000, "20s"],
                      ] as const).map(([ms, label]) => (
                        <button
                          key={ms}
                          type="button"
                          className={`source-preset-btn${revealMs === ms ? " active" : ""}`}
                          onClick={() => onSelectRevealMs(ms)}
                        >
                          <strong>{label}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-block">
                    <span className="field-label">Mode réponse</span>
                    <div className="source-preset-grid">
                      <button
                        type="button"
                        className={`source-preset-btn${answerMode === "mcq_only" ? " active" : ""}`}
                        onClick={() => onSelectAnswerMode("mcq_only")}
                      >
                        <strong>QCM</strong>
                        <span>Choix multiples uniquement</span>
                      </button>
                      <button
                        type="button"
                        className={`source-preset-btn${answerMode === "text_only" ? " active" : ""}`}
                        onClick={() => onSelectAnswerMode("text_only")}
                      >
                        <strong>Texte</strong>
                        <span>Réponse libre uniquement</span>
                      </button>
                      <button
                        type="button"
                        className={`source-preset-btn${answerMode === "mixed" ? " active" : ""}`}
                        onClick={() => onSelectAnswerMode("mixed")}
                      >
                        <strong>Mixte</strong>
                        <span>Alternance QCM / Texte</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="status">Seul le host peut modifier la configuration source.</p>
              )}

              <div className="room-meta-list">
                <p>
                  <span>Mode source</span>
                  <strong>
                    {state.sourceMode === "anilist_union"
                      ? "AniList synchronise"
                      : state.sourceMode === "players_liked"
                        ? "Liked Songs joueurs"
                        : "Playlist publique"}
                  </strong>
                </p>
                <p>
                  <span>Playlist</span>
                  <strong>
                    {withRomajiLabel(
                      state.sourceConfig.publicPlaylist?.name ?? "Aucune playlist selectionnee",
                    )}
                  </strong>
                </p>
                <p>
                  <span>Mode thèmes</span>
                  <strong>
                    {state.sourceConfig.themeMode === "op_only"
                      ? "OP only"
                      : state.sourceConfig.themeMode === "ed_only"
                        ? "ED only"
                        : "Mix"}
                  </strong>
                </p>
                <p>
                  <span>Difficulte</span>
                  <strong>{difficultyFilterLabel(state.sourceConfig.difficultyFilter)}</strong>
                </p>
                <p>
                  <span>Décennies</span>
                  <strong>{contentDecadesLabel(state.sourceConfig.contentFilters)}</strong>
                </p>
                <p>
                  <span>Genres</span>
                  <strong>{contentGenresLabel(state.sourceConfig.contentFilters)}</strong>
                </p>
                <p>
                  <span>Mode vies</span>
                  <strong>{state.livesMode ? livesPresetLabel(state.maxLives) : "Off"}</strong>
                </p>
              </div>

              <div className="waiting-actions">
                <button
                  className={`ghost-btn${currentPlayer?.isReady ? " selected" : ""}`}
                  type="button"
                  disabled={!hasActivePlayerSeat || readyMutation.isPending || isResolvingTracks}
                  onClick={() => {
                    if (!currentPlayer) return;
                    readyMutation.mutate(!currentPlayer.isReady);
                  }}
                >
                  {currentPlayer?.isReady ? "Je ne suis plus prêt" : "Je suis prêt"}
                </button>
                {isHost && (
                  <button
                    className="solid-btn"
                    onClick={() => startMutation.mutate()}
                    disabled={
                      startMutation.isPending ||
                      startRetryRemainingMs > 0 ||
                      !state.canStart ||
                      isResolvingTracks ||
                      isPlayersLikedPoolBuilding
                    }
                  >
                    {startMutation.isPending ? "Lancement..." : "Lancer la partie"}
                  </button>
                )}
              </div>

              <p className="status">
                Joueurs prêts: {state.readyCount}/{state.players.length}
                {lobbyReadyStatus}
              </p>
              <ul className="lobby-player-list">
                {state.players.map((player) => (
                  <li key={player.playerId}>
                    <div>
                      <strong>{player.displayName}</strong>
                      <p>
                        {player.isHost ? "Host" : "Joueur"} -{" "}
                        {player.isReady ? "Prêt" : "En attente"}
                      </p>
                      {state.livesMode && (
                        <small className={`lobby-player-lives${player.isEliminated ? " eliminated" : ""}`}>
                          {renderLivesHearts(player.lives, state.maxLives)}
                        </small>
                      )}
                    </div>
                    {isHost && player.playerId !== session.playerId && (
                      <button
                        className="ghost-btn"
                        type="button"
                        disabled={kickMutation.isPending}
                        onClick={() => kickMutation.mutate(player.playerId)}
                      >
                        Éjecter
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {effectivePhase === "playing" && isSpectating && (
            <div className="spectator-banner" role="status" aria-live="polite">
              <strong>Éliminé</strong>
              <span>Mode spectateur actif. Tu peux suivre la manche sans répondre.</span>
            </div>
          )}

          {effectivePhase === "playing" && !isSpectating && state?.mode === "mcq" && (
            <div className="mcq-grid">
              {(state.choices ?? []).map((choice, index) => (
                <button
                  key={`${choice.value}-${index}`}
                  className={`choice-btn${submittedMcq?.round === state?.round && submittedMcq.choice === choice.value ? " selected" : ""}`}
                  disabled={answerMutation.isPending || !session.playerId || mcqLocked}
                  onClick={() => onSelectChoice(choice.value)}
                >
                  {formatRoundChoiceLabel(choice, titlePreference)}
                </button>
              ))}
            </div>
          )}

          {effectivePhase === "playing" && !isSpectating && state?.mode === "text" && (
            <form className="panel-form answer-box" onSubmit={onSubmitText}>
              <label>
                <span>Réponse (nom de l'anime)</span>
                <Select<AnswerSelectOption, false>
                  classNamePrefix="answer-select"
                  inputId="answer-select-input"
                  unstyled
                  options={answerSelectOptions}
                  value={selectedAnswerOption}
                  inputValue={answer}
                  onInputChange={(inputValue: string, actionMeta: InputActionMeta) => {
                    if (actionMeta.action === "input-change") {
                      setAnswer(inputValue.slice(0, 80));
                    }
                    if (actionMeta.action === "set-value") {
                      // Keep input in sync after option selection
                    }
                  }}
                  onChange={(option: SingleValue<AnswerSelectOption>) => {
                    if (!option) {
                      setAnswer("");
                      return;
                    }
                    setAnswer(option.value.slice(0, 80));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      // Prevent react-select from selecting the highlighted option.
                      // The form's onSubmit will handle submission instead.
                      event.preventDefault();
                      const form = (event.target as HTMLElement).closest("form");
                      if (form) form.requestSubmit();
                    }
                  }}
                  filterOption={() => true}
                  placeholder="Nom de l'anime"
                  noOptionsMessage={() =>
                    typedAnswer.length <= 0
                      ? "Tape un nom d'anime"
                      : answerSeedIsLoading
                        ? "Chargement des animes..."
                        : "Aucune suggestion"
                  }
                  isLoading={
                    typedAnswer.length >= 1 &&
                    answerSeedIsLoading &&
                    answerSelectOptions.length <= 0
                  }
                  openMenuOnFocus
                  blurInputOnSelect={false}
                  isDisabled={textLocked || answerMutation.isPending}
                />
              </label>
              <button
                className="solid-btn"
                type="submit"
                disabled={answerMutation.isPending || !session.playerId || textLocked}
              >
                {textLocked ? "Réponse envoyée" : answerMutation.isPending ? "Envoi..." : "Valider"}
              </button>
            </form>
          )}

          {effectivePhase === "playing" && !isSpectating && (
            <div className="phase-skip-panel">
              <button
                className="ghost-btn"
                type="button"
                disabled={skipGuessDisabled}
                onClick={() => skipMutation.mutate()}
              >
                {hasLockedGuessVote ? "En attente des autres..." : "Skip"}
              </button>
              <p className="status">
                Validation:{" "}
                <strong>
                  {state?.guessDoneCount ?? 0}/{state?.guessTotalCount ?? 0}
                </strong>
              </p>
            </div>
          )}

          {(state?.state === "reveal" || state?.state === "leaderboard") && state?.reveal && (
            <div className="reveal-box large reveal-glass">
              <div className="reveal-cover">
                {revealArtwork ? (
                  <img src={revealArtwork} alt={`${state.reveal.title} cover`} />
                ) : (
                  <div className="reveal-cover-fallback" aria-hidden="true" />
                )}
              </div>
              <div className="reveal-content">
                <p className="kicker">Reveal</p>
                <h3 className="reveal-title">
                  {formatRevealTitle(state.reveal, titlePreference)}
                </h3>
                {state.reveal.songTitle && (
                  <p className="reveal-song-title">{state.reveal.songTitle}</p>
                )}
                {state.reveal.songArtists.length > 0 && (
                  <p className="reveal-song-artists">{state.reveal.songArtists.join(", ")}</p>
                )}
                <p className="reveal-artist">
                  {withRomajiLabel(state.reveal.artist, state.reveal.artistRomaji)}
                </p>
              </div>
            </div>
          )}

          {state?.state === "reveal" && !isSpectating && (
            <div className="phase-skip-panel">
              <button
                className="ghost-btn"
                type="button"
                disabled={skipRevealDisabled}
                onClick={() => skipMutation.mutate()}
              >
                {hasLockedRevealVote ? "En attente des autres..." : "Next"}
              </button>
              <p className="status">
                Votes Next:{" "}
                <strong>
                  {state.revealSkipCount}/{state.revealSkipTotalCount}
                </strong>
              </p>
            </div>
          )}

          {state?.state === "results" && (
            <div className="podium-panel">
              <p className="kicker">Final</p>
              <h3 className="podium-title">Podium final</h3>
              <div className="podium-grid">
                {podiumSlots.map((slot) => (
                  <article
                    key={slot.rank}
                    className={`podium-step ${slot.tone}${slot.entry ? "" : " empty"}`}
                  >
                    <p className="podium-rank">#{slot.rank}</p>
                    <strong>{slot.entry?.displayName ?? "Aucun joueur"}</strong>
                    <span>{slot.entry ? `${slot.entry.score} pts` : "—"}</span>
                  </article>
                ))}
              </div>
              <div className="waiting-actions">
                <button className="ghost-btn" type="button" onClick={leaveRoom}>
                  Quitter la room
                </button>
                {isHost ? (
                  <button
                    className="solid-btn"
                    type="button"
                    onClick={() => {
                      rememberCurrentRoomSettings();
                      replayMutation.mutate();
                    }}
                  >
                    {replayMutation.isPending ? "Retour lobby..." : "Rejouer"}
                  </button>
                ) : (
                  <p className="status">Le host peut relancer vers le lobby.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="arena-side meta-side">
            <h2 className="side-title">Chat</h2>
            <div ref={chatLogRef} className="room-chat-log">
              {chatMessages.map((message) => (
                <p key={message.id} className="room-chat-message">
                  <strong>{message.displayName}</strong>
                  <span>{message.text}</span>
                </p>
              ))}
              {chatMessages.length <= 0 && (
                <p className="room-chat-empty">Aucun message pour l'instant.</p>
              )}
              <div ref={chatEndRef} className="room-chat-end" />
            </div>
            <form className="panel-form" onSubmit={onSubmitChat}>
              <label>
                <span>Message</span>
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.currentTarget.value)}
                  maxLength={400}
                  placeholder="Ecris a la room..."
                />
              </label>
              <button
                className="solid-btn"
                type="submit"
                disabled={chatMutation.isPending || !session.playerId}
              >
                {chatMutation.isPending ? "Envoi..." : "Envoyer"}
              </button>
            </form>
            {!isResults && (
              <button className="ghost-btn" type="button" onClick={leaveRoom}>
                Quitter la room
              </button>
            )}
          </aside>
      </article>

      <audio
        ref={audioRef}
        className="blindtest-audio"
        preload="auto"
        onError={() => setAudioError(true)}
      >
        <track kind="captions" />
      </audio>
    </section>
  );
}
