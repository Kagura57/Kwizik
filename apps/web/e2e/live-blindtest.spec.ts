import { expect, test } from "@playwright/test";

function buildSnapshot(
  phase: "playing" | "reveal",
  overrides?: Partial<{
    mode: "text" | "mcq";
    choices: Array<{
      value: string;
      titleRomaji: string;
      titleEnglish: string | null;
      themeLabel: string;
    }> | null;
  }>,
) {
  const now = Date.now();
  const media = {
    provider: "animethemes" as const,
    trackId: "video-1",
    sourceUrl: "https://v.animethemes.moe/demo-track.webm",
    embedUrl: null,
  };

  return {
    roomCode: "ABC123",
    state: phase,
    round: 1,
    mode: overrides?.mode ?? ("text" as const),
    choices: overrides?.choices ?? null,
    serverNowMs: now,
    playerCount: 1,
    hostPlayerId: "p1",
    players: [
      {
        playerId: "p1",
        displayName: "Host",
        isReady: true,
        hasAnsweredCurrentRound: false,
        isHost: true,
        canContributeLibrary: true,
        libraryContribution: {
          includeInPool: { spotify: false, deezer: false },
          linkedProviders: { spotify: "not_linked", deezer: "not_linked" },
          estimatedTrackCount: { spotify: 0, deezer: 0 },
          syncStatus: "ready",
          lastError: null,
        },
      },
    ],
    readyCount: 1,
    allReady: true,
    canStart: true,
    isResolvingTracks: false,
    poolSize: 10,
    categoryQuery: "anilist:linked:union",
    sourceMode: "anilist_union" as const,
    sourceConfig: {
      mode: "anilist_union" as const,
      themeMode: "mix" as const,
      publicPlaylist: null,
      playersLikedRules: { minContributors: 1, minTotalTracks: 1 },
    },
    poolBuild: {
      status: "ready" as const,
      contributorsCount: 1,
      mergedTracksCount: 20,
      playableTracksCount: 20,
      lastBuiltAtMs: now,
      errorCode: null,
    },
    totalRounds: 10,
    deadlineMs: now + 8_000,
    previewUrl: "https://v.animethemes.moe/demo-track.webm",
    media,
    reveal:
      phase === "reveal"
        ? {
            round: 1,
            trackId: "video-1",
            provider: "animethemes" as const,
            title: "Attack on Titan",
            titleRomaji: "Attack on Titan",
            artist: "OP1",
            artistRomaji: "OP1",
            acceptedAnswer: "Attack on Titan",
            mode: "text" as const,
            previewUrl: "https://v.animethemes.moe/demo-track.webm",
            sourceUrl: "https://v.animethemes.moe/demo-track.webm",
            embedUrl: null,
            playerAnswers: [],
          }
        : null,
    leaderboard: [],
    chatMessages: [],
    answerSuggestions: ["Naruto", "Bleach"],
  };
}

test("anime round keeps video hidden during guessing then reveals without restart", async ({ page }) => {
  let phase: "playing" | "reveal" = "playing";

  await page.route("**/realtime/room/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        roomCode: "ABC123",
        snapshot: buildSnapshot(phase),
        serverNowMs: Date.now(),
      }),
    });
  });

  await page.route("**/room/**/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSnapshot(phase)),
    });
  });

  await page.goto("/room/ABC123/play");

  await expect(page.locator("video.anime-video-hidden")).toHaveCount(1);

  phase = "reveal";
  await expect.poll(async () => page.locator("video.anime-video-reveal").count()).toBeGreaterThan(0);
});

test("text answer select keeps the chosen anime visible after selection", async ({ page }) => {
  await page.route("**/realtime/room/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        roomCode: "ABC123",
        snapshot: buildSnapshot("playing"),
        serverNowMs: Date.now(),
      }),
    });
  });

  await page.route("**/room/**/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSnapshot("playing")),
    });
  });

  await page.route("**/account/preferences/title", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, titlePreference: "romaji" }),
    });
  });

  await page.route("**/anime/autocomplete?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        q: "Nar",
        suggestions: [
          {
            animeId: 20,
            label: "Naruto",
            score: 1,
            matchedAlias: "Naruto",
          },
        ],
      }),
    });
  });

  await page.goto("/room/ABC123/play");

  const answerInput = page.locator("#answer-select-input");
  await answerInput.click();
  await answerInput.fill("Nar");
  await page.getByText("Naruto", { exact: true }).click();

  await expect(answerInput).toHaveValue("Naruto");

  const computed = await answerInput.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      borderTopWidth: style.borderTopWidth,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      backgroundColor: style.backgroundColor,
    };
  });

  expect(computed).toEqual({
    borderTopWidth: "0px",
    paddingTop: "0px",
    paddingRight: "0px",
    paddingBottom: "0px",
    paddingLeft: "0px",
    backgroundColor: "rgba(0, 0, 0, 0)",
  });
});

test("projection mcq uses english titles when english preference is selected", async ({ page }) => {
  const snapshot = buildSnapshot("playing", {
    mode: "mcq",
    choices: [
      {
        value: "Shingeki no Kyojin - OP1",
        titleRomaji: "Shingeki no Kyojin",
        titleEnglish: "Attack on Titan",
        themeLabel: "OP1",
      },
    ],
  });

  await page.route("**/realtime/room/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        roomCode: "ABC123",
        snapshot,
        serverNowMs: Date.now(),
      }),
    });
  });

  await page.route("**/room/**/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot),
    });
  });

  await page.route("**/account/preferences/title", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, titlePreference: "english" }),
    });
  });

  await page.goto("/room/ABC123/view");

  const choice = page.locator(".projection-choice").first();
  await expect(choice).toHaveText("Attack on Titan - OP1");
  await expect(choice).not.toContainText("Shingeki no Kyojin");
});

test("host lobby exposes random classic button and posts correct source mode", async ({ page }) => {
  const now = Date.now();
  const lobbySnapshot = {
    roomCode: "ABC123",
    state: "waiting" as const,
    round: 0,
    mode: null,
    choices: null,
    serverNowMs: now,
    playerCount: 1,
    hostPlayerId: "p1",
    players: [
      {
        playerId: "p1",
        displayName: "Host",
        isReady: false,
        hasAnsweredCurrentRound: false,
        isHost: true,
        lives: 3,
        isEliminated: false,
        canContributeLibrary: true,
        libraryContribution: {
          includeInPool: { spotify: false, deezer: false },
          linkedProviders: { spotify: "not_linked" as const, deezer: "not_linked" as const },
          estimatedTrackCount: { spotify: 0, deezer: 0 },
          syncStatus: "ready" as const,
          lastError: null,
        },
      },
    ],
    readyCount: 0,
    allReady: false,
    canStart: false,
    isResolvingTracks: false,
    poolSize: 0,
    categoryQuery: "anilist:linked:union",
    sourceMode: "anilist_union" as const,
    sourceConfig: {
      mode: "anilist_union" as const,
      themeMode: "mix" as const,
      difficultyFilter: "all" as const,
      contentFilters: { decades: [], genres: [] },
      publicPlaylist: null,
      playersLikedRules: { minContributors: 1, minTotalTracks: 1 },
    },
    answerMode: "mixed" as const,
    livesMode: false,
    maxLives: 3,
    roomRoundConfig: { maxRounds: 10, playingMs: 20_000, revealMs: 20_000 },
    poolBuild: {
      status: "idle" as const,
      contributorsCount: 0,
      mergedTracksCount: 0,
      playableTracksCount: 0,
      lastBuiltAtMs: null,
      errorCode: null,
    },
    totalRounds: 10,
    deadlineMs: null,
    previewUrl: null,
    media: null,
    nextMedia: null,
    roundSync: {
      status: "idle" as const,
      phaseToken: null,
      plannedStartAtMs: null,
      maxWaitUntilMs: null,
      mediaOffsetSec: 0,
      preparedCount: 0,
      requiredPreparedCount: 0,
      totalPlayerCount: 1,
    },
    guessDoneCount: 0,
    guessTotalCount: 0,
    mediaReadyCount: 0,
    mediaReadyTotalCount: 0,
    revealSkipCount: 0,
    revealSkipTotalCount: 0,
    reveal: null,
    leaderboard: [],
    chatMessages: [],
    answerSuggestions: [],
  };

  await page.route("**/quiz/create", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ roomCode: "ABC123" }),
    });
  });

  await page.route("**/quiz/join", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, playerId: "p1", displayName: "Host" }),
    });
  });

  await page.route("**/quiz/public", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rooms: [] }),
    });
  });

  await page.route("**/realtime/room/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        roomCode: "ABC123",
        snapshot: lobbySnapshot,
        serverNowMs: now,
      }),
    });
  });

  await page.route("**/room/**/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(lobbySnapshot),
    });
  });

  await page.route("**/account/preferences/title", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, titlePreference: "romaji" }),
    });
  });

  let capturedBody = "";
  await page.route("**/quiz/source/mode", async (route) => {
    capturedBody = route.request().postData() ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, mode: "random_classic" }),
    });
  });

  await page.goto("/");
  await page.locator("#create-room").click();
  await page.waitForURL("**/room/ABC123/play");

  const randomClassicBtn = page.locator(".source-preset-btn", { hasText: "Blindtest aléatoire classique" });
  await expect(randomClassicBtn).toBeVisible();

  await randomClassicBtn.click();

  await expect.poll(() => capturedBody).not.toBe("");
  expect(JSON.parse(capturedBody).mode).toBe("random_classic");
});
