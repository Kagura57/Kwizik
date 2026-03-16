# App Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the main backend/frontend maintenance hotspots and trim unnecessary room snapshot refresh work without changing the visible product behavior.

**Architecture:** Extract the densest pure or projection-oriented logic out of `RoomStore`, share the room snapshot contract where it removes real duplication, and centralize gameplay snapshot refresh behavior in the web route so realtime remains the primary update path.

**Tech Stack:** Bun, TypeScript, Elysia, React 19, TanStack Query, TanStack Router, Zustand, Vitest, Vite

---

### Task 1: Extract Room Snapshot Projection

**Files:**
- Create: `apps/api/src/services/roomSnapshot.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Test: `apps/api/tests/room-store.spec.ts`

**Step 1: Write the failing test**

Add or extend a `room-store` test that asserts the room snapshot still exposes the same fields for a waiting or playing room after `roomStore.roomState(roomCode)`.

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/room-store.spec.ts`
Expected: FAIL after the snapshot logic is moved but before wiring is complete.

**Step 3: Write minimal implementation**

- Move the payload-building logic from `RoomStore.roomState()` into `createRoomSnapshot(...)` in `apps/api/src/services/roomSnapshot.ts`.
- Keep `RoomStore` responsible for gathering dependencies and progressing the session.
- Pass only the data/functions needed by the projector.

**Step 4: Run test to verify it passes**

Run: `bun test apps/api/tests/room-store.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/roomSnapshot.ts apps/api/src/services/RoomStore.ts apps/api/tests/room-store.spec.ts
git commit -m "refactor: extract room snapshot projection"
```

### Task 2: Extract MCQ Choice Builder

**Files:**
- Create: `apps/api/src/services/roundChoiceBuilder.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Test: `apps/api/tests/room-store.spec.ts`

**Step 1: Write the failing test**

Pin an existing MCQ behavior in `room-store.spec.ts` that exercises coherent distractor selection and canonical deduplication.

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/room-store.spec.ts -t "deduplicates MCQ anime choices|builds MCQ choices with coherent language distractors"`
Expected: FAIL while extraction is incomplete.

**Step 3: Write minimal implementation**

- Move the choice-profile and MCQ option assembly helpers into `apps/api/src/services/roundChoiceBuilder.ts`.
- Keep `RoomStore.buildRoundChoices()` as a thin orchestration wrapper.
- Preserve existing heuristics and return shape exactly.

**Step 4: Run test to verify it passes**

Run: `bun test apps/api/tests/room-store.spec.ts -t "deduplicates MCQ anime choices|builds MCQ choices with coherent language distractors"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/roundChoiceBuilder.ts apps/api/src/services/RoomStore.ts apps/api/tests/room-store.spec.ts
git commit -m "refactor: extract round choice builder"
```

### Task 3: Share Minimal Room Snapshot Types

**Files:**
- Create: `packages/shared/src/room.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/api/src/services/roomSnapshot.ts`
- Test: `packages/shared/src/types.spec.ts`

**Step 1: Write the failing test**

Add a small type-level/shared-module regression or export assertion that ensures the shared room types are exported from `packages/shared`.

**Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src`
Expected: FAIL before the new shared export is wired.

**Step 3: Write minimal implementation**

- Add the minimal room snapshot enums/types shared by both backend and frontend.
- Replace duplicated local declarations in `apps/web/src/lib/api.ts` where that makes the file smaller and clearer.
- Avoid migrating unrelated types.

**Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src apps/web/src/lib/runtimeOrigin.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/room.ts packages/shared/src/index.ts apps/web/src/lib/api.ts apps/api/src/services/roomSnapshot.ts packages/shared/src/types.spec.ts
git commit -m "refactor: share room snapshot types"
```

### Task 4: Deduplicate Gameplay Snapshot Refreshes

**Files:**
- Create: `apps/web/src/routes/room/$roomCode/useSnapshotRefresh.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Test: `apps/web/src/routes/routes.spec.tsx`
- Test: `apps/web/src/routes/live-gameplay.spec.tsx`

**Step 1: Write the failing test**

Add or extend a route/gameplay test that covers a mutation flow followed by a consistent room refresh, such as ready/start/replay behavior.

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/routes/routes.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx`
Expected: FAIL before the refresh helper is correctly wired.

**Step 3: Write minimal implementation**

- Add `useSnapshotRefresh()` that dedupes or coalesces repeated `snapshotQuery.refetch()` calls.
- Route all mutation success handlers in `play.tsx` through the helper instead of directly calling `snapshotQuery.refetch()`.
- Preserve behavior for retry-heavy paths like start and anime media ready.

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/routes/routes.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add 'apps/web/src/routes/room/$roomCode/useSnapshotRefresh.ts' 'apps/web/src/routes/room/$roomCode/play.tsx' apps/web/src/routes/routes.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx
git commit -m "refactor: dedupe gameplay snapshot refreshes"
```

### Task 5: Centralize Repeated Room Action Mutation Wiring

**Files:**
- Create: `apps/web/src/routes/room/$roomCode/useRoomActionMutation.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Test: `apps/web/src/routes/routes.spec.tsx`

**Step 1: Write the failing test**

Extend an existing route test to cover a host setting mutation and its success/error handling path.

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/routes/routes.spec.tsx`
Expected: FAIL before the shared mutation helper preserves existing behavior.

**Step 3: Write minimal implementation**

- Add a thin helper hook around `useMutation` for repeated room actions with the same `PLAYER_NOT_FOUND`, notification, and refresh patterns.
- Migrate the most repetitive host mutations first: source mode, theme mode, answer mode, difficulty, content filters, lives, public playlist, ready, kick, replay.
- Keep custom paths like start/media-ready/answer separate if their behavior is materially different.

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/routes/routes.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add 'apps/web/src/routes/room/$roomCode/useRoomActionMutation.ts' 'apps/web/src/routes/room/$roomCode/play.tsx' apps/web/src/routes/routes.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx
git commit -m "refactor: centralize repeated room action mutations"
```

### Task 6: Verify the Optimization Batch

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run targeted backend tests**

Run: `bun test apps/api/tests/room-store.spec.ts`
Expected: PASS

**Step 2: Run targeted frontend tests**

Run: `bun test apps/web/src/routes apps/web/src/lib`
Expected: PASS

**Step 3: Run shared tests**

Run: `bun test packages/shared/src`
Expected: PASS

**Step 4: Run build and lint checks**

Run: `bun run lint`
Expected: PASS or warning-only baseline

Run: `cd apps/web && bun run build`
Expected: PASS

**Step 5: Document review**

- Update `tasks/todo.md` with completed items, validation evidence, and remaining risks.

**Step 6: Commit**

```bash
git add tasks/todo.md
git commit -m "docs: record app optimization verification"
```
