# Anime Quiz Full Quality Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix anime answer/autocomplete reliability, improve MCQ title display with user preference, prevent timer loss during media buffering, and randomize AnimeThemes playback start safely.

**Architecture:** Keep server-authoritative timing by inserting a `loading` phase before anime rounds, gate transition to `playing` on media-ready signals (with timeout fallback), and decouple MCQ submitted value from displayed label so UI preferences cannot break answer validation. Centralize text normalization to align autocomplete and fuzzy answer checks.

**Tech Stack:** Bun, TypeScript, Elysia, React + TanStack Query, Zustand, PostgreSQL, Vitest.

---

### Task 1: Unify Anime Text Normalization and English Alias Matching

**Files:**
- Create: `apps/api/src/services/AnimeTextNormalization.ts`
- Modify: `apps/api/src/services/FuzzyMatcher.ts`
- Modify: `apps/api/src/services/AnimeAutocomplete.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Test: `apps/api/tests/answer-anime-alias.spec.ts`
- Test: `apps/api/tests/anime-autocomplete.spec.ts`

**Step 1: Write the failing test**

```ts
it("accepts apostrophe and punctuation variants for official english titles", () => {
  expect(isTextAnswerCorrect("hells paradise", "Hell's Paradise")).toBe(true);
  expect(isTextAnswerCorrect("hell's paradise", "Hell's Paradise")).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/answer-anime-alias.spec.ts -t "apostrophe"`  
Expected: FAIL on at least one variant before shared normalization is applied everywhere.

**Step 3: Write minimal implementation**

```ts
export function normalizeAnimeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

Use this helper in fuzzy and autocomplete ranking/query normalization.

**Step 4: Run tests to verify they pass**

Run: `bun test apps/api/tests/answer-anime-alias.spec.ts apps/api/tests/anime-autocomplete.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/AnimeTextNormalization.ts apps/api/src/services/FuzzyMatcher.ts apps/api/src/services/AnimeAutocomplete.ts apps/api/src/services/RoomStore.ts apps/api/tests/answer-anime-alias.spec.ts apps/api/tests/anime-autocomplete.spec.ts
git commit -m "fix: unify anime text normalization for autocomplete and answer matching"
```

---

### Task 2: Add Account Title Preference and Persist It

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/repositories/ProfileRepository.ts`
- Modify: `apps/api/src/routes/account.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/stores/gameStore.ts`
- Modify: `apps/web/src/routes/settings.tsx`
- Test: `apps/api/tests/room-store.spec.ts`

**Step 1: Write the failing test**

```ts
it("stores and returns title preference for profile", async () => {
  const updated = await profileRepository.updateTitlePreference(userId, "english");
  expect(updated?.titlePreference).toBe("english");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/room-store.spec.ts -t "title preference"`  
Expected: FAIL due missing repository/API support.

**Step 3: Write minimal implementation**

```sql
alter table profiles
  add column if not exists title_preference text not null default 'mixed';
```

```ts
type TitlePreference = "romaji" | "english" | "mixed";
```

Add API:
- `GET /account/preferences/title`
- `POST /account/preferences/title` with validated payload.

Add settings UI control bound to this API.

**Step 4: Run tests to verify they pass**

Run: `bun test apps/api/tests/room-store.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/db/schema.sql apps/api/src/repositories/ProfileRepository.ts apps/api/src/routes/account.ts apps/web/src/lib/api.ts apps/web/src/stores/gameStore.ts apps/web/src/routes/settings.tsx apps/api/tests/room-store.spec.ts
git commit -m "feat: add persistent anime title preference per account"
```

---

### Task 3: Decouple MCQ Value from Display Label and Apply Preference

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/stores/gameStore.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`
- Test: `apps/api/tests/room-store.spec.ts`
- Test: `apps/web/src/routes/live-gameplay.spec.tsx`

**Step 1: Write the failing test**

```ts
it("keeps MCQ validation correct when display label differs from submitted value", async () => {
  const choice = playing?.choices?.[0];
  store.submitAnswer(roomCode, playerId, choice?.value ?? "");
  expect(reveal?.reveal?.playerAnswers?.[0]?.isCorrect).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/room-store.spec.ts -t "display label differs"`  
Expected: FAIL because choices are plain strings.

**Step 3: Write minimal implementation**

```ts
type RoundChoice = {
  value: string;
  titleRomaji: string;
  titleEnglish: string | null;
  themeLabel: string;
};
```

Generate round choices as objects and keep `value` canonical for scoring.
In web, render label by preference:
- `romaji`: `Romaji - Theme`
- `english`: `English - Theme` (fallback romaji)
- `mixed`: `Romaji (English) - Theme` when different.

**Step 4: Run tests to verify they pass**

Run: `bun test apps/api/tests/room-store.spec.ts apps/web/src/routes/live-gameplay.spec.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/RoomStore.ts apps/web/src/lib/api.ts apps/web/src/stores/gameStore.ts apps/web/src/routes/room/$roomCode/play.tsx apps/web/src/routes/room/$roomCode/view.tsx apps/api/tests/room-store.spec.ts apps/web/src/routes/live-gameplay.spec.tsx
git commit -m "feat: support title preference rendering for anime MCQ choices"
```

---

### Task 4: Add Server Loading Phase and Media Ready Handshake

**Files:**
- Modify: `apps/api/src/services/RoomManager.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Modify: `apps/api/src/routes/quiz.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/stores/gameStore.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/api/tests/room-store.spec.ts`

**Step 1: Write the failing test**

```ts
it("does not start playing timer before media is ready", async () => {
  // after countdown, state should be loading
  // after media ready signal, state should become playing with fresh deadline
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/api/tests/room-store.spec.ts -t "media is ready"`  
Expected: FAIL because state transitions directly to `playing`.

**Step 3: Write minimal implementation**

Add state and transition:

```ts
type GameState = "waiting" | "countdown" | "loading" | "playing" | "reveal" | "leaderboard" | "results";
```

Add endpoint:
- `POST /quiz/media/ready` with `roomCode`, `playerId`, `trackId`.

RoomStore rule:
- For anime round, `countdown -> loading`.
- `loading -> playing` when all active players ready OR loading timeout reached.

**Step 4: Run tests to verify they pass**

Run: `bun test apps/api/tests/room-store.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/RoomManager.ts apps/api/src/services/RoomStore.ts apps/api/src/routes/quiz.ts apps/web/src/lib/api.ts apps/web/src/stores/gameStore.ts apps/web/src/routes/room/$roomCode/play.tsx apps/web/src/routes/room/$roomCode/view.tsx apps/web/src/styles.css apps/api/tests/room-store.spec.ts
git commit -m "feat: gate anime round timer behind media loading readiness"
```

---

### Task 5: Randomize AnimeThemes Start Time with Duration-Safe Bounds

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`
- Test: `apps/web/src/routes/room-play-anime.spec.tsx`

**Step 1: Write the failing test**

```ts
it("computes deterministic random anime start within duration-20s", () => {
  const start = computeAnimeStartSec({ roomCode: "ROOM1", round: 2, trackId: "vid", durationSec: 100 });
  expect(start).toBeGreaterThanOrEqual(0);
  expect(start).toBeLessThanOrEqual(80);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/routes/room-play-anime.spec.tsx -t "random anime start"`  
Expected: FAIL because helper/logic does not exist.

**Step 3: Write minimal implementation**

Use metadata duration and deterministic seed:

```ts
const maxStart = Math.max(0, Math.floor(durationSec) - 20);
const startSec = deterministicIntFromSeed(seed, 0, maxStart);
video.currentTime = startSec;
```

Only mark `media/ready` after seek is applied and `canplaythrough`/`playing` confirms readiness.

**Step 4: Run tests to verify they pass**

Run: `bun test apps/web/src/routes/room-play-anime.spec.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/routes/room/$roomCode/play.tsx apps/web/src/routes/room/$roomCode/view.tsx apps/web/src/routes/room-play-anime.spec.tsx
git commit -m "feat: randomize animethemes playback start with deterministic bounds"
```

---

### Task 6: Full Regression Validation

**Files:**
- Modify: none
- Test: `apps/api/tests`
- Test: `apps/web/src/routes`

**Step 1: Run focused tests**

Run: `bun test apps/api/tests/answer-anime-alias.spec.ts apps/api/tests/anime-autocomplete.spec.ts apps/api/tests/room-store.spec.ts apps/web/src/routes/live-gameplay.spec.tsx apps/web/src/routes/room-play-anime.spec.tsx`

Expected: PASS.

**Step 2: Run project test suite**

Run: `bun test`

Expected: PASS.

**Step 3: Commit**

```bash
git add -A
git commit -m "test: validate anime quiz fixes end-to-end"
```
