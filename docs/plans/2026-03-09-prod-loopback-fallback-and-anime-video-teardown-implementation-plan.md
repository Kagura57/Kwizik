# Prod Loopback Fallback And Anime Video Teardown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove loopback fallbacks from production clients and ensure AnimeThemes videos are fully unloaded between rounds so later rounds do not stall before `media/prepared`.

**Architecture:** The web client keeps a stricter environment policy for HTTP and WebSocket candidate bases, and both room routes gain an explicit AnimeThemes teardown helper plus deduplicated warm-up diagnostics. Tests stay source-level and route-level to verify the policy and the new cleanup hooks.

**Tech Stack:** React, TanStack Query, TypeScript, Vitest, Playwright

---

### Task 1: Guard loopback fallback candidates

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/useRoomRealtimeSubscription.ts`

**Step 1: Add a loopback-allowed helper**

Define a helper that returns true only for local loopback browser origins used in local development.

**Step 2: Apply the helper to HTTP candidates**

Only append `http://127.0.0.1:3001` and `http://localhost:3001` when the helper allows it.

**Step 3: Apply the helper to WebSocket candidates**

Only append `ws://127.0.0.1:3001` and `ws://localhost:3001` when the helper allows it.

**Step 4: Keep candidate deduplication intact**

Do not change preferred-base handling or the existing retry logic.

### Task 2: Add explicit AnimeThemes teardown on `/play`

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`

**Step 1: Add a dispose helper**

Create a helper that pauses, detaches the source, calls `load()`, and logs a deduplicated lifecycle event.

**Step 2: Use the helper on source removal and track changes**

Dispose the captured previous video when the track key changes, and dispose the current video when the active AnimeThemes source disappears.

**Step 3: Use the helper on unmount**

Ensure the final mounted AnimeThemes element is unloaded during component cleanup.

**Step 4: Add warm-up diagnostics**

Log deduplicated events for low-buffer stalls, play rejections, verification timeouts, and soft reloads.

### Task 3: Mirror teardown and diagnostics on `/view`

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`

**Step 1: Add the same dispose helper pattern**

Projection should unload AnimeThemes videos just as aggressively as `/play`.

**Step 2: Add the same warm-up diagnostics**

Projection logs should make a stuck warm-up understandable without participating in quorum.

**Step 3: Ensure cleanup runs on track change and unmount**

Avoid leaving previous projection videos attached after the round changes.

### Task 4: Update tests and validate

**Files:**
- Modify: `apps/web/src/routes/room-play-anime.spec.tsx`
- Create or modify: web unit test covering loopback candidate gating if needed

**Step 1: Extend tests**

Assert that source files include the new guarded loopback condition and explicit AnimeThemes dispose hooks.

**Step 2: Run web tests**

Run the targeted Vitest suites for route playback and any new helper coverage.

**Step 3: Run the existing e2e smoke**

Re-run the focused Playwright smoke already used for the synchronized playback flow.
