# Reveal Media Continuity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep active round media playing continuously from `playing` into `reveal` on both the player and projection screens.

**Architecture:** Add a small local playback continuity rule in both routes and drive all media pause/play/timeline-sync decisions from that rule instead of hard-coding `effectivePhase === "playing"`. Keep answer UX and other room-state behavior unchanged.

**Tech Stack:** Bun, TypeScript, React, TanStack Query, Vitest

---

### Task 1: Lock the reveal continuity rule in a lightweight route test

**Files:**
- Modify: `apps/web/src/routes/room-play-anime.spec.tsx`

**Step 1: Write the failing test**

Extend the existing route-source assertion with reveal continuity markers:

```ts
it("keeps anime media continuous into reveal", () => {
  const file = readFileSync("apps/web/src/routes/room/$roomCode/play.tsx", "utf8");
  expect(file).toContain("shouldKeepMediaPlaying");
  expect(file).toContain("effectivePhase === \"reveal\"");
  expect(file).toContain("if (!shouldKeepMediaPlaying)");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/web/src/routes/room-play-anime.spec.tsx
```

Expected: FAIL because the route still pauses media whenever `effectivePhase !== "playing"`.

**Step 3: Keep the test minimal**

Do not add broader UI assertions in this step. The goal is to lock in the new playback rule with the existing lightweight test style.

**Step 4: Run test again to verify the failure is stable**

Run:

```bash
bun test apps/web/src/routes/room-play-anime.spec.tsx
```

Expected: the same assertion still fails for the same missing continuity markers.

**Step 5: Commit**

```bash
git add apps/web/src/routes/room-play-anime.spec.tsx
git commit -m "test: cover reveal media continuity markers"
```

### Task 2: Keep player-page media playing and synced through reveal

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Test: `apps/web/src/routes/room-play-anime.spec.tsx`

**Step 1: Introduce a reveal continuity helper**

Add a local boolean near the playback derivations:

```ts
const shouldKeepMediaPlaying =
  effectivePhase === "playing" || effectivePhase === "reveal";
```

**Step 2: Reuse the helper for timeline targeting**

Update the local target calculation:

```ts
if (!shouldKeepMediaPlaying || effectiveStartedAtMs === null) {
  return baseOffsetSec;
}
```

**Step 3: Reuse the helper for playback effects**

Replace the hard-coded `effectivePhase !== "playing"` guards in:

- AnimeThemes video play/pause effect
- preview audio play/pause effect
- periodic timeline sync interval
- autoplay unlock retry

with the shared continuity helper.

**Step 4: Run targeted tests**

Run:

```bash
bun test apps/web/src/routes/room-play-anime.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/routes/room/$roomCode/play.tsx apps/web/src/routes/room-play-anime.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx
git commit -m "fix: keep player media running during reveal"
```

### Task 3: Mirror reveal continuity on the projection screen

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`

**Step 1: Add the same continuity helper**

Mirror the player rule:

```ts
const shouldKeepMediaPlaying =
  effectivePhase === "playing" || effectivePhase === "reveal";
```

**Step 2: Reuse it for timeline and playback**

Apply it to:

- AnimeThemes video play/pause effect
- preview audio play/pause effect
- periodic timeline sync interval
- autoplay unlock retry
- timeline playback target calculation

**Step 3: Run the projection test slice**

Run:

```bash
bun test apps/web/src/routes/room-play-anime.spec.tsx
```

Expected: PASS, with no route-source regression introduced by the projection changes.

**Step 4: Run a broader web test slice**

Run:

```bash
bun test apps/web/src/routes/live-gameplay.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/routes/room/$roomCode/view.tsx apps/web/src/routes/room-play-anime.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx apps/web/src/routes/routes.spec.tsx
git commit -m "fix: mirror reveal media continuity on projection"
```

Plan complete and saved to `docs/plans/2026-03-09-reveal-media-continuity-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints
