import { afterEach, describe, expect, it } from "vitest";
import type { RoomState } from "./api";
import {
  DEFAULT_USER_GAME_SETTINGS,
  loadRememberedGameSettings,
  normalizeRememberedGameSettings,
  persistRememberedGameSettings,
  roomStateToRememberedGameSettings,
  shouldRestoreRememberedGameSettings,
} from "./userGameSettingsMemory";

const originalWindow = globalThis.window;
const hadWindow = "window" in globalThis;

function stubWindowWithStorage() {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return backing.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          backing.set(key, value);
        },
        removeItem(key: string) {
          backing.delete(key);
        },
      },
    },
  });
  return backing;
}

function restoreWindow() {
  if (!hadWindow) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: originalWindow,
  });
}

function buildRoomState(
  overrides: Partial<
    Pick<RoomState, "sourceMode" | "sourceConfig" | "answerMode" | "livesMode" | "maxLives" | "roomRoundConfig">
  > = {},
): Pick<RoomState, "sourceMode" | "sourceConfig" | "answerMode" | "livesMode" | "maxLives" | "roomRoundConfig"> {
  return {
    sourceMode: overrides.sourceMode ?? "anilist_union",
    sourceConfig: {
      mode: "anilist_union",
      themeMode: "mix",
      difficultyFilter: "all",
      contentFilters: { decades: [], genres: [] },
      publicPlaylist: null,
      playersLikedRules: {
        minContributors: 1,
        minTotalTracks: 20,
      },
      ...overrides.sourceConfig,
    },
    answerMode: overrides.answerMode ?? "mixed",
    livesMode: overrides.livesMode ?? false,
    maxLives: overrides.maxLives ?? 3,
    roomRoundConfig: overrides.roomRoundConfig ?? {
      maxRounds: 10,
      playingMs: 20_000,
      revealMs: 20_000,
    },
  };
}

describe("user game settings memory", () => {
  afterEach(() => {
    restoreWindow();
  });

  it("persists and reloads remembered game settings from local storage", () => {
    stubWindowWithStorage();

    persistRememberedGameSettings({
      sourceMode: "anilist_union",
      themeMode: "ed_only",
      difficultyFilter: "hard",
      contentFilters: {
        decades: [2020, 2010, 2020],
        genres: ["Drama", "Action", "Drama"],
      },
      answerMode: "text_only",
      livesMode: true,
      maxLives: 2,
      roundConfig: {
        maxRounds: 15,
        playingMs: 15_000,
        revealMs: 10_000,
      },
    });

    expect(loadRememberedGameSettings()).toEqual({
      sourceMode: "anilist_union",
      themeMode: "ed_only",
      difficultyFilter: "hard",
      contentFilters: {
        decades: [2010, 2020],
        genres: ["Action", "Drama"],
      },
      answerMode: "text_only",
      livesMode: true,
      maxLives: 2,
      roundConfig: {
        maxRounds: 15,
        playingMs: 15_000,
        revealMs: 10_000,
      },
    });
  });

  it("maps room state into the remembered host settings shape", () => {
    const settings = roomStateToRememberedGameSettings(
      buildRoomState({
        sourceConfig: {
          mode: "anilist_union",
          themeMode: "op_only",
          difficultyFilter: "medium",
          contentFilters: {
            decades: [2000],
            genres: ["Comedy"],
          },
          publicPlaylist: null,
          playersLikedRules: {
            minContributors: 1,
            minTotalTracks: 20,
          },
        },
        answerMode: "mcq_only",
        livesMode: true,
        maxLives: 1,
        roomRoundConfig: {
          maxRounds: 5,
          playingMs: 10_000,
          revealMs: 5_000,
        },
      }),
    );

    expect(settings).toEqual({
      sourceMode: "anilist_union",
      themeMode: "op_only",
      difficultyFilter: "medium",
      contentFilters: {
        decades: [2000],
        genres: ["Comedy"],
      },
      answerMode: "mcq_only",
      livesMode: true,
      maxLives: 1,
      roundConfig: {
        maxRounds: 5,
        playingMs: 10_000,
        revealMs: 5_000,
      },
    });
  });

  it("restores remembered settings only when the host lobby is still pristine", () => {
    const remembered = normalizeRememberedGameSettings({
      themeMode: "ed_only",
      difficultyFilter: "easy",
      answerMode: "text_only",
      livesMode: true,
      maxLives: 2,
      roundConfig: {
        maxRounds: 15,
        playingMs: 15_000,
        revealMs: 10_000,
      },
    });

    expect(
      shouldRestoreRememberedGameSettings(
        roomStateToRememberedGameSettings(buildRoomState()),
        remembered,
      ),
    ).toBe(true);

    expect(
      shouldRestoreRememberedGameSettings(
        roomStateToRememberedGameSettings(
          buildRoomState({
            answerMode: "text_only",
          }),
        ),
        remembered,
      ),
    ).toBe(false);

    expect(shouldRestoreRememberedGameSettings(DEFAULT_USER_GAME_SETTINGS, null)).toBe(false);
  });

  it("includes sourceMode in remembered settings when mapped from room state", () => {
    const settings = roomStateToRememberedGameSettings(
      buildRoomState({ sourceMode: "random_classic" }),
    );
    expect(settings).toMatchObject({ sourceMode: "random_classic" });
  });

  it("persists and reloads sourceMode from local storage", () => {
    stubWindowWithStorage();

    persistRememberedGameSettings({
      ...DEFAULT_USER_GAME_SETTINGS,
      sourceMode: "random_classic",
    });

    expect(loadRememberedGameSettings()).toMatchObject({ sourceMode: "random_classic" });
  });

  it("triggers restore when sourceMode differs from default", () => {
    const remembered = normalizeRememberedGameSettings({
      ...DEFAULT_USER_GAME_SETTINGS,
      sourceMode: "random_classic",
    });
    expect(
      shouldRestoreRememberedGameSettings(
        roomStateToRememberedGameSettings(buildRoomState()),
        remembered,
      ),
    ).toBe(true);
  });

  it("migrates v1 settings when v2 key is absent, preserving compatible fields with default sourceMode", () => {
    const backing = stubWindowWithStorage();

    const v1Settings = {
      themeMode: "op_only",
      difficultyFilter: "hard",
      contentFilters: { decades: [2010], genres: ["Action"] },
      answerMode: "text_only",
      livesMode: true,
      maxLives: 5,
      roundConfig: { maxRounds: 20, playingMs: 30_000, revealMs: 15_000 },
    };
    backing.set("kwizik:user-game-settings:v1", JSON.stringify(v1Settings));

    const loaded = loadRememberedGameSettings();

    expect(loaded).toEqual({
      sourceMode: DEFAULT_USER_GAME_SETTINGS.sourceMode,
      themeMode: "op_only",
      difficultyFilter: "hard",
      contentFilters: { decades: [2010], genres: ["Action"] },
      answerMode: "text_only",
      livesMode: true,
      maxLives: 5,
      roundConfig: { maxRounds: 20, playingMs: 30_000, revealMs: 15_000 },
    });
  });

  it("returns null when neither v2 nor v1 settings exist in storage", () => {
    stubWindowWithStorage();
    expect(loadRememberedGameSettings()).toBeNull();
  });

  it("prefers v2 settings over v1 when both exist", () => {
    const backing = stubWindowWithStorage();

    backing.set(
      "kwizik:user-game-settings:v1",
      JSON.stringify({ themeMode: "op_only", difficultyFilter: "easy" }),
    );
    backing.set(
      "kwizik:user-game-settings:v2",
      JSON.stringify({ ...DEFAULT_USER_GAME_SETTINGS, themeMode: "ed_only" }),
    );

    const loaded = loadRememberedGameSettings();
    expect(loaded).toMatchObject({ themeMode: "ed_only" });
  });
});
