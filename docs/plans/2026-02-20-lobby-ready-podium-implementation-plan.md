# Lobby Ready Podium Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move game setup to a host-managed lobby with ready checks, add moderation/replay controls, and keep reveal media immersive.

**Architecture:** Extend `RoomStore` with host ownership and player readiness, expose new quiz endpoints (`source`, `ready`, `kick`, `leave`, `replay`), and surface lobby + podium actions in the player UI. Preserve YouTube-only reveal playback and non-interactive reveal iframe behavior.

**Tech Stack:** Bun, TypeScript, Elysia API, React + TanStack Query/Router, Vitest.

---

### Task 1: Backend lobby state machine

**Files:**
- Modify: `apps/api/src/services/RoomManager.ts`
- Modify: `apps/api/src/services/RoomStore.ts`

**Step 1:** Add lobby reset capability on room manager.
**Step 2:** Add host + readiness tracking on room players.
**Step 3:** Enforce host-only start with all-ready and source-set constraints.
**Step 4:** Add room operations: set source, set ready, kick, leave, replay.

### Task 2: API routes for lobby controls

**Files:**
- Modify: `apps/api/src/routes/quiz.ts`

**Step 1:** Update `/quiz/start` contract to include `playerId`.
**Step 2:** Add `/quiz/source`, `/quiz/ready`, `/quiz/kick`, `/quiz/leave`, `/quiz/replay`.
**Step 3:** Map service status codes to HTTP status + stable error codes.

### Task 3: Frontend lobby + podium UI

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`
- Modify: `apps/web/src/routes/join.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1:** Extend room snapshot type with host/readiness/player list fields.
**Step 2:** Add API wrappers for source/ready/kick/leave/replay.
**Step 3:** Refactor home flow to create lobby first.
**Step 4:** Build waiting-lobby host controls + player ready buttons + moderation actions.
**Step 5:** Add results podium panel with replay and quit actions.
**Step 6:** Make reveal iframe non-interactive using CSS wrapper + pointer-events none.

### Task 4: Regression coverage

**Files:**
- Modify: `apps/api/tests/room-store.spec.ts`
- Modify: `apps/api/tests/flow.integration.spec.ts`
- Modify: `apps/api/tests/room-routes.spec.ts`

**Step 1:** Update start flow tests for source + ready requirements.
**Step 2:** Add room-store coverage for host-only/all-ready/replay.
**Step 3:** Update route assertions for empty-source lobby defaults.
