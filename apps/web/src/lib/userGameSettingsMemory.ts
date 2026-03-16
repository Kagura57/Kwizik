import type { RoomContentFilters, RoomDifficultyFilter, RoomState } from "./api";

type SourceMode = "public_playlist" | "players_liked" | "anilist_union" | "random_classic";
type ThemeMode = "op_only" | "ed_only" | "mix";
type AnswerMode = "mcq_only" | "text_only" | "mixed";

export type RememberedGameSettings = {
  sourceMode: SourceMode;
  themeMode: ThemeMode;
  difficultyFilter: RoomDifficultyFilter;
  contentFilters: RoomContentFilters;
  answerMode: AnswerMode;
  livesMode: boolean;
  maxLives: number;
  roundConfig: {
    maxRounds: number;
    playingMs: number;
    revealMs: number;
  };
};

const STORAGE_KEY = "kwizik:user-game-settings:v2";
const LEGACY_V1_STORAGE_KEY = "kwizik:user-game-settings:v1";
const VALID_SOURCE_MODES = new Set<SourceMode>(["public_playlist", "players_liked", "anilist_union", "random_classic"]);
const VALID_THEME_MODES = new Set<ThemeMode>(["op_only", "ed_only", "mix"]);
const VALID_DIFFICULTY_FILTERS = new Set<RoomDifficultyFilter>(["all", "easy", "medium", "hard"]);
const VALID_ANSWER_MODES = new Set<AnswerMode>(["mcq_only", "text_only", "mixed"]);

export const DEFAULT_USER_GAME_SETTINGS: RememberedGameSettings = {
  sourceMode: "anilist_union",
  themeMode: "mix",
  difficultyFilter: "all",
  contentFilters: {
    decades: [],
    genres: [],
  },
  answerMode: "mixed",
  livesMode: false,
  maxLives: 3,
  roundConfig: {
    maxRounds: 10,
    playingMs: 20_000,
    revealMs: 20_000,
  },
};

function storage() {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return null;
  }
  return window.localStorage;
}

function normalizeContentFilters(raw: unknown): RoomContentFilters {
  const filters =
    raw && typeof raw === "object"
      ? (raw as {
          decades?: unknown;
          genres?: unknown;
        })
      : {};

  const decades = Array.isArray(filters.decades)
    ? [...new Set(filters.decades.filter((value): value is number => Number.isInteger(value)))].sort(
        (left, right) => left - right,
      )
    : [];
  const genres = Array.isArray(filters.genres)
    ? [...new Set(filters.genres.filter((value): value is string => typeof value === "string"))].sort(
        (left, right) => left.localeCompare(right),
      )
    : [];

  return { decades, genres };
}

export function normalizeRememberedGameSettings(raw: unknown): RememberedGameSettings {
  const value =
    raw && typeof raw === "object"
      ? (raw as {
          sourceMode?: unknown;
          themeMode?: unknown;
          difficultyFilter?: unknown;
          contentFilters?: unknown;
          answerMode?: unknown;
          livesMode?: unknown;
          maxLives?: unknown;
          roundConfig?: {
            maxRounds?: unknown;
            playingMs?: unknown;
            revealMs?: unknown;
          };
        })
      : {};
  const sourceMode = VALID_SOURCE_MODES.has(value.sourceMode as SourceMode)
    ? (value.sourceMode as SourceMode)
    : DEFAULT_USER_GAME_SETTINGS.sourceMode;
  const themeMode = VALID_THEME_MODES.has(value.themeMode as ThemeMode)
    ? (value.themeMode as ThemeMode)
    : DEFAULT_USER_GAME_SETTINGS.themeMode;
  const difficultyFilter = VALID_DIFFICULTY_FILTERS.has(
    value.difficultyFilter as RoomDifficultyFilter,
  )
    ? (value.difficultyFilter as RoomDifficultyFilter)
    : DEFAULT_USER_GAME_SETTINGS.difficultyFilter;
  const answerMode = VALID_ANSWER_MODES.has(value.answerMode as AnswerMode)
    ? (value.answerMode as AnswerMode)
    : DEFAULT_USER_GAME_SETTINGS.answerMode;
  const livesMode =
    typeof value.livesMode === "boolean"
      ? value.livesMode
      : DEFAULT_USER_GAME_SETTINGS.livesMode;
  const maxLives =
    typeof value.maxLives === "number" && Number.isInteger(value.maxLives) && value.maxLives > 0
      ? value.maxLives
      : DEFAULT_USER_GAME_SETTINGS.maxLives;
  const roundConfig = value.roundConfig ?? {};
  const maxRounds =
    typeof roundConfig.maxRounds === "number" &&
    Number.isInteger(roundConfig.maxRounds) &&
    roundConfig.maxRounds > 0
      ? roundConfig.maxRounds
      : DEFAULT_USER_GAME_SETTINGS.roundConfig.maxRounds;
  const playingMs =
    typeof roundConfig.playingMs === "number" &&
    Number.isInteger(roundConfig.playingMs) &&
    roundConfig.playingMs > 0
      ? roundConfig.playingMs
      : DEFAULT_USER_GAME_SETTINGS.roundConfig.playingMs;
  const revealMs =
    typeof roundConfig.revealMs === "number" &&
    Number.isInteger(roundConfig.revealMs) &&
    roundConfig.revealMs > 0
      ? roundConfig.revealMs
      : DEFAULT_USER_GAME_SETTINGS.roundConfig.revealMs;

  return {
    sourceMode,
    themeMode,
    difficultyFilter,
    contentFilters: normalizeContentFilters(value.contentFilters),
    answerMode,
    livesMode,
    maxLives,
    roundConfig: {
      maxRounds,
      playingMs,
      revealMs,
    },
  };
}

export function loadRememberedGameSettings() {
  const availableStorage = storage();
  if (!availableStorage) return null;
  try {
    const raw = availableStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeRememberedGameSettings(JSON.parse(raw));

    // Migrate legacy v1 settings: preserve compatible fields, reset sourceMode to default.
    const legacyRaw = availableStorage.getItem(LEGACY_V1_STORAGE_KEY);
    if (!legacyRaw) return null;
    const legacyParsed = JSON.parse(legacyRaw) as unknown;
    const legacyBase = legacyParsed && typeof legacyParsed === "object" ? legacyParsed : {};
    return normalizeRememberedGameSettings({
      ...legacyBase,
      sourceMode: DEFAULT_USER_GAME_SETTINGS.sourceMode,
    });
  } catch {
    return null;
  }
}

export function persistRememberedGameSettings(settings: RememberedGameSettings) {
  const availableStorage = storage();
  if (!availableStorage) return;
  availableStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeRememberedGameSettings(settings)));
}

export function rememberedGameSettingsEqual(
  left: RememberedGameSettings,
  right: RememberedGameSettings,
) {
  return (
    JSON.stringify(normalizeRememberedGameSettings(left)) ===
    JSON.stringify(normalizeRememberedGameSettings(right))
  );
}

export function isDefaultRememberedGameSettings(settings: RememberedGameSettings) {
  return rememberedGameSettingsEqual(
    normalizeRememberedGameSettings(settings),
    DEFAULT_USER_GAME_SETTINGS,
  );
}

export function roomStateToRememberedGameSettings(
  state: Pick<RoomState, "sourceMode" | "sourceConfig" | "answerMode" | "livesMode" | "maxLives" | "roomRoundConfig">,
): RememberedGameSettings {
  return normalizeRememberedGameSettings({
    sourceMode: state.sourceMode,
    themeMode: state.sourceConfig.themeMode,
    difficultyFilter: state.sourceConfig.difficultyFilter,
    contentFilters: state.sourceConfig.contentFilters,
    answerMode: state.answerMode,
    livesMode: state.livesMode,
    maxLives: state.maxLives,
    roundConfig: state.roomRoundConfig,
  });
}

export function shouldRestoreRememberedGameSettings(
  current: RememberedGameSettings,
  remembered: RememberedGameSettings | null,
) {
  if (!remembered) return false;
  return (
    isDefaultRememberedGameSettings(current) &&
    !isDefaultRememberedGameSettings(remembered) &&
    !rememberedGameSettingsEqual(current, remembered)
  );
}
