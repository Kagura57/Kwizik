# Random Anime Blindtest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a host-selectable `random_classic` anime mode that starts each game from a fresh remote AniList-driven draw, maps it to playable AnimeThemes entries, never reuses a prior selection pool between games, and keeps room settings / replay UX coherent.

**Architecture:** Extend the existing `RoomStore` source-mode pipeline instead of creating a second gameplay path. Add a dedicated AniList random-discovery service plus a `RoomStore` builder for `random_classic`, reuse the existing AniList theme filtering/backfill logic where possible, and expose the mode through the room API, snapshot types, lobby UI, and remembered host settings.

**Tech Stack:** TypeScript, Bun, Elysia, React 19, TanStack Query, PostgreSQL, Vitest, Playwright

---

### Task 1: Lock the backend contract for the new source mode

**Files:**
- Modify: `apps/api/tests/room-anime-mode.spec.ts`
- Modify: `apps/api/tests/room-routes.spec.ts`
- Modify: `apps/api/tests/room-store.spec.ts:2344-2474`
- Reference: `apps/api/src/services/RoomStore.ts:38, 920-928, 2274-2330, 2700-2832, 3448-3479`
- Reference: `apps/api/src/routes/quiz.ts:222-252`

**Step 1: Write the failing source-mode switch test**

```ts
it("allows host to switch to random_classic mode", () => {
  const store = new RoomStore();
  const created = store.createRoom();
  const joined = store.joinRoom(created.roomCode, "Host");
  if (joined.status !== "ok") return;

  const result = store.setRoomSourceMode(created.roomCode, joined.value.playerId, "random_classic");
  expect(result).toMatchObject({ status: "ok", mode: "random_classic" });
});
```

**Step 2: Write the failing route/snapshot coverage**

```ts
expect(payload.sourceMode).toBe("random_classic");
expect(payload.categoryQuery).toBe("anilist:random:classic");
```

Add one route test that posts `/quiz/source/mode` with `mode: "random_classic"` and one room snapshot assertion that the source mode and category query survive the round-trip.

**Step 3: Write the failing room-start regression**

```ts
it("starts random_classic without requiring linked AniList players", async () => {
  const getRandomAniListAnimeIds = vi.fn().mockResolvedValue([101, 102, 103, 104]);
  const store = new RoomStore({ getRandomAniListAnimeIds });
  // join with anonymous host only
  // switch to random_classic
  // mock pool.query to return playable AnimeThemes rows
  // expect startGame().ok === true
  // expect userAnimeLibraryRepository.animeIdsForUser not to be called
});
```

**Step 4: Run the focused backend tests to confirm failure**

Run:

```bash
bun test apps/api/tests/room-anime-mode.spec.ts apps/api/tests/room-routes.spec.ts apps/api/tests/room-store.spec.ts -t "random_classic|room anime source mode|room snapshot"
```

Expected: FAIL because `random_classic` is not yet part of the backend types / route validation / room start path.

**Step 5: Commit**

```bash
git add apps/api/tests/room-anime-mode.spec.ts apps/api/tests/room-routes.spec.ts apps/api/tests/room-store.spec.ts
git commit -m "test: define random classic room mode contract"
```

---

### Task 2: Add the remote AniList random-discovery service

**Files:**
- Create: `apps/api/src/services/AniListRandomAnimeSource.ts`
- Create: `apps/api/tests/anilist-random-anime-source.spec.ts`
- Reference: `apps/api/src/routes/music/anilist.ts:1-188`
- Reference: `apps/api/src/services/AniListTitleLookup.ts`
- Reference: `apps/api/src/routes/music/http.ts`

**Step 1: Write the failing service tests**

Cover:
- builds a fresh seeded request plan per game
- deduplicates anime IDs across multiple remote pages / slices
- keeps fetching until the requested candidate floor is reached or the remote source is exhausted
- does not cache the selected anime pool between calls

```ts
it("returns fresh deduplicated AniList anime ids for each seed", async () => {
  const first = await fetchRandomAniListAnimeIds({ seed: "seed-a", desiredCount: 24 });
  const second = await fetchRandomAniListAnimeIds({ seed: "seed-b", desiredCount: 24 });
  expect(first).not.toEqual(second);
  expect(new Set(first).size).toBe(first.length);
});
```

**Step 2: Run the new test to verify failure**

Run:

```bash
bun test apps/api/tests/anilist-random-anime-source.spec.ts
```

Expected: FAIL because the service file does not exist yet.

**Step 3: Write the minimal service**

Start with a dedicated exported function:

```ts
export async function fetchRandomAniListAnimeIds(input: {
  seed: string;
  desiredCount: number;
  themeMode: "op_only" | "ed_only" | "mix";
}): Promise<number[]> {
  // build seeded remote slice plan
  // fetch AniList GraphQL pages
  // collect anime ids
  // dedupe and stop once desiredCount is met
}
```

Implementation notes:
- reuse the project HTTP helper instead of raw `fetch`
- keep the cache boundary technical only (request memoization / metadata), never selected-id reuse
- log slice count, fetched page count, and collected unique anime IDs

**Step 4: Run the service tests to verify pass**

Run:

```bash
bun test apps/api/tests/anilist-random-anime-source.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/AniListRandomAnimeSource.ts apps/api/tests/anilist-random-anime-source.spec.ts
git commit -m "feat: add AniList random anime discovery service"
```

---

### Task 3: Implement `random_classic` in `RoomStore` with a fresh per-game pool

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts:38, 223-229, 231-240, 920-928, 950-964, 1198-1468, 2073-2125, 2274-2330, 2700-2953, 3448-3479`
- Modify: `apps/api/tests/room-store.spec.ts:2344-2474`
- Reference: `apps/api/src/services/AniListRoomFilters.ts`
- Reference: `apps/api/src/repositories/UserAnimeLibraryRepository.ts:245`

**Step 1: Extend the failing room-store tests**

Add/expand tests for:
- `random_classic` starts with an anonymous host and no linked players
- `random_classic` calls the new AniList random service instead of `animeIdsForUser`
- `random_classic` does not reuse a previous game’s answer pool
- existing AniList union randomness regression stays green

```ts
expect(userAnimeLibraryRepository.animeIdsForUser).not.toHaveBeenCalled();
expect(getRandomAniListAnimeIds).toHaveBeenCalledTimes(1);
expect(started).toMatchObject({ ok: true, sourceMode: "random_classic" });
```

**Step 2: Run the focused room-store tests to confirm failure**

Run:

```bash
bun test apps/api/tests/room-store.spec.ts -t "random_classic|unbiased AniList random draw"
```

Expected: FAIL because `RoomStore` does not know the new mode or dependency.

**Step 3: Implement the minimal `RoomStore` wiring**

Add the new mode and dependency:

```ts
type RoomSourceMode = "public_playlist" | "players_liked" | "anilist_union" | "random_classic";

type RoomStoreDependencies = {
  getRandomAniListAnimeIds?: (input: {
    seed: string;
    desiredCount: number;
    themeMode: RoomThemeMode;
  }) => Promise<number[]>;
};
```

Then:
- add `isRandomClassicSource(mode)` helper
- update `sourceQueryForSession()` to return `anilist:random:classic`
- update `canStartWaitingSession()` so this mode does **not** require linked players
- update `setRoomSourceMode()` to clear stale pools and set `categoryQuery = "anilist:random:classic"`
- add `buildRandomClassicTrackPool(session, requestedRounds)` that:
  - generates a fresh seed per start
  - asks `getRandomAniListAnimeIds()` for a broad candidate set
  - reuses / extracts the existing AnimeThemes row selection + theme/difficulty/content filter logic
  - returns answer + distractor pools without touching player AniList libraries
- update `startGame()` to branch into `buildRandomClassicTrackPool()` before the generic track-cache path
- keep `createRoom()` / replay defaults untouched unless a failing test proves the new mode must persist there

**Step 4: Run the focused room-store tests to verify pass**

Run:

```bash
bun test apps/api/tests/room-store.spec.ts -t "random_classic|unbiased AniList random draw"
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/RoomStore.ts apps/api/tests/room-store.spec.ts
git commit -m "feat: add fresh random classic room pool builder"
```

---

### Task 4: Wire the API, snapshot, and diagnostics surfaces

**Files:**
- Modify: `apps/api/src/routes/quiz.ts:222-252`
- Modify: `apps/api/src/index.ts:37-55`
- Modify: `apps/api/tests/room-routes.spec.ts`
- Modify: `apps/api/tests/track-source-resolver.spec.ts`
- Modify: `apps/api/src/services/TrackSourceResolver.ts:14-64, 107-175`

**Step 1: Add the failing parser / diagnostics tests**

Add one parser test:

```ts
it("parses the random classic AniList source", () => {
  const parsed = parseTrackSource("anilist:random:classic");
  expect(parsed.type).toBe("anilist_random_classic");
});
```

Also update the room route test to assert `/quiz/source/mode` accepts `"random_classic"`.

**Step 2: Run the focused tests to confirm failure**

Run:

```bash
bun test apps/api/tests/room-routes.spec.ts apps/api/tests/track-source-resolver.spec.ts
```

Expected: FAIL because the route validator and parser do not recognize the new source.

**Step 3: Implement the minimal API/plumbing changes**

```ts
if (
  mode !== "public_playlist" &&
  mode !== "players_liked" &&
  mode !== "anilist_union" &&
  mode !== "random_classic"
) {
  return { ok: false, error: "INVALID_MODE" };
}
```

Also:
- add `anilist:random:classic` to health/detail source examples
- add parser support so the source query is not misclassified as a generic search string
- only add resolver execution support here if the implementation already has a clean shared service; otherwise keep this step parser-only and document the room-only behavior inline

**Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test apps/api/tests/room-routes.spec.ts apps/api/tests/track-source-resolver.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/quiz.ts apps/api/src/index.ts apps/api/src/services/TrackSourceResolver.ts apps/api/tests/room-routes.spec.ts apps/api/tests/track-source-resolver.spec.ts
git commit -m "feat: expose random classic source mode across api surfaces"
```

---

### Task 5: Expose the new mode in the web client and remembered host settings

**Files:**
- Modify: `apps/web/src/lib/api.ts:70-137, 534-572`
- Modify: `apps/web/src/lib/userGameSettingsMemory.ts`
- Modify: `apps/web/src/lib/userGameSettingsMemory.spec.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx:69-120, 1102-1118, 1372-1475, 2890-2911`
- Modify: `apps/web/e2e/live-blindtest.spec.ts`

**Step 1: Write the failing frontend tests**

Add coverage that:
- `RoomState` / `setRoomSourceMode()` types accept `"random_classic"`
- remembered settings include `sourceMode`
- restoring remembered settings reapplies `setRoomSourceMode("random_classic")`
- the lobby renders and posts the new host button

```ts
expect(roomStateToRememberedGameSettings(buildRoomState({
  sourceConfig: { mode: "random_classic", ... }
}))).toMatchObject({ sourceMode: "random_classic" });
```

For Playwright, intercept `/quiz/source/mode` and assert the request body:

```ts
expect(JSON.parse(postBody).mode).toBe("random_classic");
```

**Step 2: Run the targeted frontend tests to confirm failure**

Run:

```bash
bun test apps/web/src/lib/userGameSettingsMemory.spec.ts apps/web/src/routes && npx playwright test apps/web/e2e/live-blindtest.spec.ts --grep "random classic"
```

Expected: FAIL because the type unions, remembered settings shape, and UI do not expose the new mode yet.

**Step 3: Implement the minimal web changes**

Add the new mode to the type unions:

```ts
type SourceMode = "public_playlist" | "players_liked" | "anilist_union" | "random_classic";
```

Then:
- extend `RoomState.sourceMode`, `RoomState.sourceConfig.mode`, `startRoom()`, and `setRoomSourceMode()` response/input types
- add `sourceMode` to `RememberedGameSettings`
- bump the local-storage schema key if needed (recommended: `kwizik:user-game-settings:v2`)
- restore `sourceMode` before the other dependent room settings
- add the host button copy, e.g. `Blindtest aléatoire classique` / `Tirage anime global frais à chaque partie`
- keep the AniList-union button and labels intact

**Step 4: Run the targeted frontend tests to verify pass**

Run:

```bash
bun test apps/web/src/lib/userGameSettingsMemory.spec.ts apps/web/src/routes
npx playwright test apps/web/e2e/live-blindtest.spec.ts --grep "random classic"
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/userGameSettingsMemory.ts apps/web/src/lib/userGameSettingsMemory.spec.ts apps/web/src/routes/room/$roomCode/play.tsx apps/web/e2e/live-blindtest.spec.ts
git commit -m "feat: add random classic room mode to lobby ui"
```

---

### Task 6: Run the full verification pass and update task tracking

**Files:**
- Modify: `tasks/todo.md`
- Reference: `docs/plans/2026-03-13-random-anime-blindtest-design.md`

**Step 1: Run the focused backend suite**

Run:

```bash
bun test apps/api/tests/room-anime-mode.spec.ts apps/api/tests/room-routes.spec.ts apps/api/tests/anilist-random-anime-source.spec.ts apps/api/tests/track-source-resolver.spec.ts
bun test apps/api/tests/room-store.spec.ts -t "random_classic|unbiased AniList random draw"
```

Expected: PASS

**Step 2: Run the focused frontend suite**

Run:

```bash
bun test apps/web/src/lib/userGameSettingsMemory.spec.ts apps/web/src/routes
npx playwright test apps/web/e2e/live-blindtest.spec.ts --grep "random classic"
```

Expected: PASS

**Step 3: Run the repo-wide sanity checks already used by this codebase**

Run:

```bash
bun run lint
bun test
```

Expected: PASS, or only pre-existing unrelated warnings/failures already documented in `tasks/todo.md`

**Step 4: Update the task log review section**

Add:
- root cause summary
- final implementation summary
- exact tests run and results
- any remaining unrelated failures

**Step 5: Commit**

```bash
git add tasks/todo.md
git commit -m "docs: record random anime blindtest verification"
```
