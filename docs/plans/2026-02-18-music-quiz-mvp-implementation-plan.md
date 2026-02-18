# Music Quiz MVP (Sprint 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a stable multiplayer core loop (create/join/start/play/reveal/results) with mandatory streak scoring and server-authoritative fairness.

**Architecture:** Bun monorepo with `apps/api` (Elysia) and `apps/web` (React + TanStack Router) sharing strict contracts in `packages/shared`. Backend owns room state machine, deadlines, and scoring; frontend is a realtime projection with reconnect/resync support. Tests are TDD-first: unit for core rules, integration for API flow, and one user-directed E2E smoke path.

**Tech Stack:** Bun workspaces, TypeScript strict, Elysia, React 19, TanStack Router, TanStack Query, Zustand, Supabase Realtime, Vitest, Playwright.

---

## Skill References

- `@brainstorming` (already completed and approved in `docs/plans/2026-02-18-music-quiz-mvp-design.md`)
- `@supabase-postgres-best-practices` for schema and query safety
- `@webapp-testing` for Playwright E2E implementation
- `@executing-plans` for plan execution batching

### Task 1: Bootstrap Monorepo And Test Tooling

**Files:**
- Create: `package.json`
- Create: `bunfig.toml`
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`
- Create: `apps/web/package.json`
- Create: `packages/shared/package.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.ts`
- Test: `apps/api/tests/bootstrap.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/tests/bootstrap.spec.ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("bootstrap", () => {
  it("builds an Elysia app instance", () => {
    expect(app).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/bootstrap.spec.ts`  
Expected: FAIL with module resolution error for `apps/api/src/index`.

**Step 3: Write minimal implementation**

```ts
// apps/api/src/index.ts
import { Elysia } from "elysia";

export const app = new Elysia();
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/api/tests/bootstrap.spec.ts`  
Expected: PASS (1 test).

**Step 5: Commit**

```bash
git add package.json bunfig.toml tsconfig.base.json apps/api packages/shared apps/web
git commit -m "chore: bootstrap bun monorepo and api test harness"
```

### Task 2: Define Shared Contracts For Realtime Game Loop

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/events.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/types.spec.ts`

**Step 1: Write the failing test**

```ts
// packages/shared/src/types.spec.ts
import { describe, expect, it } from "vitest";
import { GAME_STATES } from "./constants";

describe("shared contracts", () => {
  it("includes required room states", () => {
    expect(GAME_STATES).toContain("waiting");
    expect(GAME_STATES).toContain("results");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/types.spec.ts`  
Expected: FAIL with missing module `./constants`.

**Step 3: Write minimal implementation**

```ts
// packages/shared/src/constants.ts
export const GAME_STATES = ["waiting", "countdown", "playing", "reveal", "results"] as const;
```

```ts
// packages/shared/src/types.ts
export type GameState = (typeof import("./constants").GAME_STATES)[number];
export type RoomCode = string;
export type PlayerId = string;
```

```ts
// packages/shared/src/events.ts
export type RoomEvent =
  | { type: "round_start"; round: number; deadlineMs: number }
  | { type: "round_reveal"; round: number; correctAnswer: string }
  | { type: "game_results" };
```

```ts
// packages/shared/src/index.ts
export * from "./constants";
export * from "./events";
export * from "./types";
```

**Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src/types.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add strict game contracts and realtime events"
```

### Task 3: Implement ScoreCalculator With Mandatory Streak

**Files:**
- Create: `apps/api/src/services/ScoreCalculator.ts`
- Test: `apps/api/tests/score-calculator.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/tests/score-calculator.spec.ts
import { describe, expect, it } from "vitest";
import { applyScore } from "../src/services/ScoreCalculator";

describe("ScoreCalculator", () => {
  it("increases multiplier on consecutive correct answers", () => {
    const a = applyScore({ isCorrect: true, responseMs: 1800, streak: 0, baseScore: 1000 });
    const b = applyScore({ isCorrect: true, responseMs: 1700, streak: a.nextStreak, baseScore: 1000 });
    expect(a.multiplier).toBe(1);
    expect(b.multiplier).toBeGreaterThan(a.multiplier);
  });

  it("resets streak on timeout", () => {
    const result = applyScore({ isCorrect: false, responseMs: 15000, streak: 3, baseScore: 1000 });
    expect(result.nextStreak).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/score-calculator.spec.ts`  
Expected: FAIL with missing module `ScoreCalculator`.

**Step 3: Write minimal implementation**

```ts
// apps/api/src/services/ScoreCalculator.ts
type ApplyScoreInput = {
  isCorrect: boolean;
  responseMs: number;
  streak: number;
  baseScore: number;
};

const STREAK_MULTIPLIERS = [1, 1.1, 1.25, 1.5] as const;

export function applyScore(input: ApplyScoreInput) {
  if (!input.isCorrect) {
    return { earned: 0, nextStreak: 0, multiplier: 1 };
  }

  const nextStreak = input.streak + 1;
  const idx = Math.min(nextStreak - 1, STREAK_MULTIPLIERS.length - 1);
  const multiplier = STREAK_MULTIPLIERS[idx];
  const speedFactor = Math.max(0.5, 1 - input.responseMs / 20000);
  const earned = Math.round(input.baseScore * multiplier * speedFactor);

  return { earned, nextStreak, multiplier };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/api/tests/score-calculator.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/ScoreCalculator.ts apps/api/tests/score-calculator.spec.ts
git commit -m "feat(api): add mandatory streak score calculator"
```

### Task 4: Implement RoomManager State Machine (Server Authority)

**Files:**
- Create: `apps/api/src/services/RoomManager.ts`
- Test: `apps/api/tests/room-manager.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/tests/room-manager.spec.ts
import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/services/RoomManager";

describe("RoomManager", () => {
  it("transitions waiting -> countdown on start", () => {
    const room = new RoomManager("ABCD12");
    expect(room.state()).toBe("waiting");
    room.startGame();
    expect(room.state()).toBe("countdown");
  });

  it("accepts only one answer per player per round", () => {
    const room = new RoomManager("ABCD12");
    room.startGame();
    room.forcePlayingRound(1, Date.now() + 10_000);
    const first = room.submitAnswer("p1", "song");
    const second = room.submitAnswer("p1", "song-again");
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/room-manager.spec.ts`  
Expected: FAIL with missing module `RoomManager`.

**Step 3: Write minimal implementation**

```ts
// apps/api/src/services/RoomManager.ts
type GameState = "waiting" | "countdown" | "playing" | "reveal" | "results";

export class RoomManager {
  private gameState: GameState = "waiting";
  private answers = new Map<string, string>();

  constructor(public readonly roomCode: string) {}

  state(): GameState {
    return this.gameState;
  }

  startGame() {
    if (this.gameState !== "waiting") return;
    this.gameState = "countdown";
  }

  forcePlayingRound(_round: number, _deadlineMs: number) {
    this.answers.clear();
    this.gameState = "playing";
  }

  submitAnswer(playerId: string, value: string) {
    if (this.gameState !== "playing") return { accepted: false as const };
    if (this.answers.has(playerId)) return { accepted: false as const };
    this.answers.set(playerId, value);
    return { accepted: true as const };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/api/tests/room-manager.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/RoomManager.ts apps/api/tests/room-manager.spec.ts
git commit -m "feat(api): add room manager state machine and answer lock"
```

### Task 5: Add Core Quiz Routes (Create/Join/Start/Answer/Results)

**Files:**
- Create: `apps/api/src/routes/quiz.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/tests/quiz-routes.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/tests/quiz-routes.spec.ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("quiz routes", () => {
  it("creates a room", async () => {
    const res = await app.handle(new Request("http://localhost/quiz/create", { method: "POST" }));
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/quiz-routes.spec.ts`  
Expected: FAIL with 404.

**Step 3: Write minimal implementation**

```ts
// apps/api/src/routes/quiz.ts
import { Elysia } from "elysia";

export const quizRoutes = new Elysia({ prefix: "/quiz" })
  .post("/create", () => ({ roomCode: "ABCD12" }))
  .post("/join", () => ({ ok: true }))
  .post("/start", () => ({ ok: true }))
  .post("/answer", () => ({ accepted: true }))
  .get("/results/:roomCode", ({ params }) => ({ roomCode: params.roomCode, ranking: [] }));
```

```ts
// apps/api/src/index.ts
import { Elysia } from "elysia";
import { quizRoutes } from "./routes/quiz";

export const app = new Elysia().use(quizRoutes);
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/api/tests/quiz-routes.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/routes/quiz.ts apps/api/tests/quiz-routes.spec.ts
git commit -m "feat(api): add core quiz routes for room flow"
```

### Task 6: Add Room Snapshot Endpoint For Reconnect/Resync

**Files:**
- Create: `apps/api/src/routes/room.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/tests/room-routes.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/tests/room-routes.spec.ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("room snapshot", () => {
  it("returns room state for resync", async () => {
    const res = await app.handle(new Request("http://localhost/room/ABCD12/state"));
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/room-routes.spec.ts`  
Expected: FAIL with 404.

**Step 3: Write minimal implementation**

```ts
// apps/api/src/routes/room.ts
import { Elysia } from "elysia";

export const roomRoutes = new Elysia({ prefix: "/room" }).get("/:code/state", ({ params }) => ({
  roomCode: params.code,
  state: "waiting",
  round: 0,
  serverNowMs: Date.now(),
}));
```

```ts
// apps/api/src/index.ts
import { Elysia } from "elysia";
import { quizRoutes } from "./routes/quiz";
import { roomRoutes } from "./routes/room";

export const app = new Elysia().use(quizRoutes).use(roomRoutes);
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/api/tests/room-routes.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/routes/room.ts apps/api/src/index.ts apps/api/tests/room-routes.spec.ts
git commit -m "feat(api): add room snapshot endpoint for reconnect resync"
```

### Task 7: Implement Web Route Skeleton For Core User Journey

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/index.tsx`
- Create: `apps/web/src/routes/join.tsx`
- Create: `apps/web/src/routes/lobby/$roomCode.tsx`
- Create: `apps/web/src/routes/play/$roomCode.tsx`
- Create: `apps/web/src/routes/results/$roomCode.tsx`
- Create: `apps/web/src/stores/gameStore.ts`
- Test: `apps/web/src/routes/routes.spec.tsx`

**Step 1: Write the failing test**

```tsx
// apps/web/src/routes/routes.spec.tsx
import { describe, expect, it } from "vitest";
import { createGameStore } from "../stores/gameStore";

describe("web skeleton", () => {
  it("creates a game store with initial state", () => {
    const store = createGameStore();
    expect(store.getState().isMuted).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/routes/routes.spec.tsx`  
Expected: FAIL with missing module `gameStore`.

**Step 3: Write minimal implementation**

```ts
// apps/web/src/stores/gameStore.ts
import { createStore } from "zustand/vanilla";

type GameState = { isMuted: boolean; setMuted: (value: boolean) => void };

export const createGameStore = () =>
  createStore<GameState>((set) => ({
    isMuted: false,
    setMuted: (value) => set({ isMuted: value }),
  }));
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/routes/routes.spec.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add core route skeleton and game ui store"
```

### Task 8: Add API Integration And E2E Smoke Gates

**Files:**
- Create: `apps/api/tests/flow.integration.spec.ts`
- Create: `apps/web/e2e/core-flow.spec.ts`
- Create: `.github/workflows/ci.yml`

**Step 1: Write the failing test**

```ts
// apps/api/tests/flow.integration.spec.ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("core flow integration", () => {
  it("supports create -> join -> start", async () => {
    const createRes = await app.handle(new Request("http://localhost/quiz/create", { method: "POST" }));
    expect(createRes.status).toBe(200);
    const joinRes = await app.handle(new Request("http://localhost/quiz/join", { method: "POST" }));
    expect(joinRes.status).toBe(200);
    const startRes = await app.handle(new Request("http://localhost/quiz/start", { method: "POST" }));
    expect(startRes.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/flow.integration.spec.ts`  
Expected: FAIL until endpoints and payload contracts are aligned.

**Step 3: Write minimal implementation**

```ts
// apps/web/e2e/core-flow.spec.ts
import { test, expect } from "@playwright/test";

test("host can create room and reach lobby", async ({ page }) => {
  await page.goto("http://localhost:5173/");
  await expect(page).toHaveURL(/\/$/);
});
```

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
```

**Step 4: Run test to verify it passes**

Run: `bun test`  
Expected: PASS for unit/integration suite; E2E smoke ready once web server command is wired.

**Step 5: Commit**

```bash
git add apps/api/tests/flow.integration.spec.ts apps/web/e2e/core-flow.spec.ts .github/workflows/ci.yml
git commit -m "test: add integration and e2e smoke quality gates"
```

## Order And Stop Conditions

1. Execute Tasks 1-3 first, then checkpoint review.
2. Execute Tasks 4-6, then checkpoint review.
3. Execute Tasks 7-8, then checkpoint review.
4. Stop immediately if a required dependency is missing or a test fails repeatedly.

Plan complete and saved to `docs/plans/2026-02-18-music-quiz-mvp-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
