# AnimeThemes Strict Start Gating Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AnimeThemes rounds from starting before every active player has verified real local media start, and remove all automatic AnimeThemes round skipping.

**Architecture:** Keep the existing `POST /quiz/media/prepared` endpoint, but upgrade its semantics so the web client sends it only after a muted hidden playback warm-up has genuinely started. On the API side, replace quorum-plus-timeout scheduling with unanimous readiness and eliminate AnimeThemes auto-skip transitions.

**Tech Stack:** Bun, TypeScript, React, Vitest, Playwright

---

### Task 1: Lock unanimous no-timeout sync behavior in API tests

**Files:**
- Modify: `apps/api/tests/round-sync-coordinator.spec.ts`
- Modify: `apps/api/tests/room-store.spec.ts`

**Step 1: Replace quorum scheduling coverage**

Update the coordinator test so three players require all three acknowledgements:

```ts
sync.prepareRound({ nowMs: 10_000, phaseToken: "phase-1", playerIds: ["p1", "p2", "p3"], hostPlayerId: "p1", mediaOffsetSec: 12 });
sync.markPrepared("p1", 10_150);
sync.markPrepared("p2", 10_250);
expect(sync.maybeScheduleStart(10_250)).toBeNull();
sync.markPrepared("p3", 10_350);
expect(sync.maybeScheduleStart(10_350)).toEqual({
  type: "scheduled",
  startAtMs: 11_250,
  reason: "all_ready",
});
```

**Step 2: Replace timeout-start coverage**

Update the timeout test so the room never schedules from elapsed wait alone:

```ts
expect(sync.maybeScheduleStart(22_000)).toBeNull();
expect(sync.snapshot().plannedStartAtMs).toBeNull();
```

**Step 3: Add room-store loading persistence coverage**

Replace the existing "starts after short sync timeout" room-store test with:

```ts
expect(store.roomState(created.roomCode)?.state).toBe("loading");
nowMs = 120_000;
const stillLoading = store.roomState(created.roomCode);
expect(stillLoading?.state).toBe("loading");
expect(stillLoading?.roundSync.status).toBe("preparing");
expect(stillLoading?.roundSync.plannedStartAtMs).toBeNull();
```

**Step 4: Run the API test slice**

Run:

```bash
bun test apps/api/tests/round-sync-coordinator.spec.ts apps/api/tests/room-store.spec.ts
```

Expected: FAIL before implementation.

**Step 5: Commit**

```bash
git add apps/api/tests/round-sync-coordinator.spec.ts apps/api/tests/room-store.spec.ts
git commit -m "test: require unanimous animethemes round start"
```

### Task 2: Remove server-side AnimeThemes auto-skip and timeout scheduling

**Files:**
- Modify: `apps/api/src/services/RoundSyncCoordinator.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Test: `apps/api/tests/round-sync-coordinator.spec.ts`
- Test: `apps/api/tests/room-store.spec.ts`

**Step 1: Require all players in the sync coordinator**

Replace the prepared threshold helper with:

```ts
function requiredPreparedCount(playerIds: string[]) {
  return playerIds.length;
}
```

Change `RoundStartSchedule.reason` to:

```ts
reason: "all_ready";
```

Remove timeout scheduling from `maybeScheduleStart()` so it only schedules when:

```ts
this.preparedPlayerIds.size >= this.requiredPrepared
```

**Step 2: Remove AnimeThemes loading-time auto-skip**

Delete or neutralize the logic in `maybeSkipStalledLoadingRound()` so AnimeThemes loading never advances the round automatically.

**Step 3: Make unavailable reports non-advancing**

Update `reportMediaUnavailable()` so AnimeThemes reports no longer call:

```ts
session.manager.skipPlayingRound(...)
session.manager.expireCurrentPhase(...)
```

Instead, keep the room state unchanged and return `accepted: false` or a non-advancing accepted result.

**Step 4: Run API tests**

Run:

```bash
bun test apps/api/tests/round-sync-coordinator.spec.ts apps/api/tests/room-store.spec.ts apps/api/tests/quiz-routes.spec.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/RoundSyncCoordinator.ts apps/api/src/services/RoomStore.ts apps/api/tests/round-sync-coordinator.spec.ts apps/api/tests/room-store.spec.ts apps/api/tests/quiz-routes.spec.ts
git commit -m "fix: require full room readiness before animethemes start"
```

### Task 3: Make player-side readiness require a real hidden playback start

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/routes/room-play-anime.spec.tsx`

**Step 1: Add loading-time warm-up verification**

Introduce a loading-only verification flow:

- keep the AnimeThemes video muted during loading
- attempt hidden local playback once there is enough buffer
- wait for a real `playing` event plus measurable `currentTime` advance
- pause and resync to the canonical round offset
- only then call `markRoomMediaPrepared()`

**Step 2: Remove client auto-skip escalation**

Stop using the extreme timeout path to:

- remove the current source
- show "Passage automatique au round suivant..."
- report media unavailable as a round-advancing action

Keep informative loading toasts and local retry attempts only.

**Step 3: Lock route-source coverage**

Extend the lightweight route test with markers such as:

```ts
expect(file).toContain("video.muted = true");
expect(file).toContain("animeStartProbeRef");
expect(file).not.toContain("Passage automatique au round suivant...");
```

**Step 4: Run the web unit test slice**

Run:

```bash
bun test apps/web/src/routes/room-play-anime.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/routes/room/$roomCode/play.tsx apps/web/src/routes/room-play-anime.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx apps/web/src/routes/routes.spec.tsx
git commit -m "fix: verify animethemes playback before marking ready"
```

### Task 4: Refresh browser-level feedback coverage

**Files:**
- Modify: `apps/web/e2e/toast-feedback.spec.ts`

**Step 1: Replace the stale auto-skip toast expectation**

Update the AnimeThemes failure feedback expectation so it no longer asserts:

```ts
"Lecture du theme impossible. Passage automatique au round suivant..."
```

Instead, assert the new long-loading / retry wording or keep the test focused on projection playback failure only.

**Step 2: Run the targeted E2E slice**

Run:

```bash
npx playwright test apps/web/e2e/toast-feedback.spec.ts
```

Expected: PASS if the local harness still reflects the current route selectors.

**Step 3: If the harness is stale, record it and do not widen scope**

If the Playwright fixture is still bound to obsolete UI structure, keep the product code unchanged and note the stale test explicitly.

**Step 4: Commit**

```bash
git add apps/web/e2e/toast-feedback.spec.ts
git commit -m "test: remove animethemes auto-skip toast expectation"
```

Plan complete and saved to `docs/plans/2026-03-09-animethemes-strict-start-gating-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints
