# Kwizik Batch Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 13 features spanning bug fixes, UX improvements, and advanced AMQ-style room settings for the Kwizik anime blind test game.

**Architecture:** Phase 1 fixes frontend bugs (scroll, chat, autocomplete, title preference) and backend improvements (randomness, AniList distribution). Phase 2 adds configurable room settings (round config, answer mode, difficulty filter, content filters, lives, teams) via new `RoomSession` fields, API endpoints, and lobby UI controls.

**Tech Stack:** Bun, TypeScript, React 19, Elysia, PostgreSQL, Vitest, react-select, Zustand, CSS

---

## Phase 1 — Bugs & Quick Wins

### Task 1: Block page scroll during gameplay

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Add body class toggle in play.tsx**

Find the `useEffect` block section (around line 430-470) and add a new effect that toggles a `.game-active` class on `document.documentElement` during active game phases:

```typescript
// Add after the existing useEffect blocks (around line 470)
useEffect(() => {
  const activePhases = ["countdown", "loading", "playing", "reveal", "leaderboard"];
  const isGameActive = state?.state != null && activePhases.includes(state.state);
  if (isGameActive) {
    document.documentElement.classList.add("game-active");
  } else {
    document.documentElement.classList.remove("game-active");
  }
  return () => {
    document.documentElement.classList.remove("game-active");
  };
}, [state?.state]);
```

**Step 2: Add CSS rules for scroll lock**

Add after the existing `html, body, #app` rule (after line 27 in styles.css):

```css
html.game-active,
html.game-active body {
  overflow: hidden;
  height: 100vh;
}
```

Also constrain the arena layout height. Modify `.blindtest-stage` (line 1138):

```css
.blindtest-stage,
.projection-stage {
  height: calc(100vh - 90px);
  max-height: calc(100vh - 90px);
  overflow: hidden;
  padding: 18px;
  display: grid;
  gap: 14px;
  /* keep existing background */
}
```

Allow sidebars to scroll internally — modify `.arena-side` (line 1204):

```css
.arena-side {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}
```

**Step 3: Verify manually**

Run: `bun run dev:web`
Open a game room, verify no horizontal/vertical scroll during gameplay phases. Verify scroll returns to normal on results screen.

**Step 4: Commit**

```bash
git add apps/web/src/routes/room/\$roomCode/play.tsx apps/web/src/styles.css
git commit -m "fix: block page scroll during active gameplay phases

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Show chat during results screen

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Remove `!isResults` guard around chat sidebar**

In play.tsx, replace the chat conditional (line 2705):

```typescript
// BEFORE:
{!isResults && (
  <aside className="arena-side meta-side">
    ...chat...
  </aside>
)}

// AFTER (always render chat):
<aside className="arena-side meta-side">
  <h2 className="side-title">Chat</h2>
  <div ref={chatLogRef} className="room-chat-log">
    {chatMessages.map((message) => (
      <p key={message.id} className="room-chat-message">
        <strong>{message.displayName}</strong>
        <span>{message.text}</span>
      </p>
    ))}
    {chatMessages.length <= 0 && (
      <p className="room-chat-empty">Aucun message pour l'instant.</p>
    )}
    <div ref={chatEndRef} className="room-chat-end" />
  </div>
  <form className="panel-form" onSubmit={onSubmitChat}>
    <label>
      <span>Message</span>
      <input
        value={chatInput}
        onChange={(event) => setChatInput(event.currentTarget.value)}
        maxLength={400}
        placeholder="Ecris a la room..."
      />
    </label>
    <button
      className="solid-btn"
      type="submit"
      disabled={chatMutation.isPending || !session.playerId}
    >
      {chatMutation.isPending ? "Envoi..." : "Envoyer"}
    </button>
  </form>
  {!isResults && (
    <button className="ghost-btn" type="button" onClick={leaveRoom}>
      Quitter la room
    </button>
  )}
</aside>
```

**Step 2: Update results layout CSS**

Change `.results-fullscreen` to keep 2 columns (center + chat) instead of 1:

```css
/* BEFORE: */
.stage-main.arena-layout.results-fullscreen {
  grid-template-columns: minmax(0, 1fr);
  min-height: calc(100vh - 190px);
  align-content: center;
}

/* AFTER: */
.stage-main.arena-layout.results-fullscreen {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  min-height: calc(100vh - 190px);
  align-content: center;
}
```

Update the responsive breakpoint (around line 2043) for mobile:

```css
@media (max-width: 768px) {
  .stage-main.arena-layout.results-fullscreen {
    grid-template-columns: 1fr;
  }
}
```

**Step 3: Commit**

```bash
git add apps/web/src/routes/room/\$roomCode/play.tsx apps/web/src/styles.css
git commit -m "feat: keep chat visible during results screen

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Fix title preference (EN/JP) not applied everywhere

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/stores/gameStore.ts`
- Modify: `apps/web/src/lib/api.ts` (if needed)

**Step 1: Fetch title preference on game page mount**

In play.tsx, add a `useQuery` to load the preference from the API, and sync it to the Zustand store. Add near the other query hooks (around line 440):

```typescript
const titlePreferenceQuery = useQuery({
  queryKey: ["account-title-preference"],
  queryFn: getAccountTitlePreference,
  staleTime: 60_000,
});

useEffect(() => {
  if (!titlePreferenceQuery.isSuccess) return;
  setAccount({ titlePreference: titlePreferenceQuery.data.titlePreference });
}, [titlePreferenceQuery.data?.titlePreference, titlePreferenceQuery.isSuccess]);
```

Make sure `getAccountTitlePreference` and `setAccount` are imported/available.

**Step 2: Apply preference to reveal title (line 2635)**

Replace:
```typescript
{withRomajiLabel(state.reveal.title, state.reveal.titleRomaji)}
```
With:
```typescript
{formatRevealTitle(state.reveal, titlePreference)}
```

Add a helper function near `formatRoundChoiceLabel`:
```typescript
function formatRevealTitle(
  reveal: { title: string; titleRomaji: string | null; titleEnglish?: string | null },
  preference: TitlePreference,
) {
  const romaji = withRomajiLabel(reveal.title, reveal.titleRomaji);
  const english = reveal.titleEnglish?.trim() ?? "";
  const hasDistinctEnglish =
    english.length > 0 && normalizeChoiceLabel(english) !== normalizeChoiceLabel(reveal.title);

  if (preference === "english" && hasDistinctEnglish) return english;
  if (preference === "mixed" && hasDistinctEnglish) return `${romaji} (${english})`;
  return romaji;
}
```

Note: The reveal object from the API needs to include `titleEnglish`. Check if `latestReveal` in `RoomStore.ts` already includes this field — it has `title` and `titleRomaji` but may not have `titleEnglish`. If missing, add it to the reveal object construction in RoomStore.ts and to the snapshot serializer.

**Step 3: Apply preference to leaderboard answers**

Find the leaderboard answer display (around line 2268) and apply the same formatting logic.

**Step 4: Run tests**

```bash
bun test
```

**Step 5: Commit**

```bash
git add apps/web/src/routes/room/\$roomCode/play.tsx apps/web/src/stores/gameStore.ts
git commit -m "fix: load and apply title preference (EN/JP) on game page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Fix autocomplete race condition

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`

**Step 1: Lock the input value at submission time**

The core issue: `onSubmitText` reads from `answer` state, but react-select's `onChange` fires right before submit when the menu reloads. Fix by capturing the raw input value directly.

Find `onSubmitText` handler and modify:

```typescript
const onSubmitText = useCallback(
  (event: React.FormEvent) => {
    event.preventDefault();
    if (textLocked || answerMutation.isPending || !session.playerId) return;
    // Use the current typed answer, not the selected option
    const rawAnswer = answer.trim();
    if (rawAnswer.length <= 0) return;
    setSubmittedText({ round: state?.round ?? 0, value: rawAnswer });
    answerMutation.mutate({ roomCode: session.roomCode!, playerId: session.playerId, answer: rawAnswer });
  },
  [answer, textLocked, answerMutation, session.playerId, session.roomCode, state?.round],
);
```

**Step 2: Add debounce to autocomplete API calls**

Find the `animeAutocompleteQuery` (useQuery) and add a debounced input:

```typescript
// Add a debounce for the autocomplete query input
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedAnswer(typedAnswer);
  }, 250);
  return () => clearTimeout(timer);
}, [typedAnswer]);
```

Use `debouncedAnswer` instead of `typedAnswer` as the query key for `animeAutocompleteQuery`. Note: `debouncedAnswer` state already exists (line 415). Check if it's already used — if not, wire it up.

**Step 3: Fix the clear bug**

When the user clears the selection, the displayed text stays. Fix by handling the `onChange(null)` case and resetting `inputValue`:

In the `onChange` handler of Select:
```typescript
onChange={(option: SingleValue<AnswerSelectOption>) => {
  if (!option) {
    setAnswer("");
    return;
  }
  setAnswer(option.value.slice(0, 80));
}}
```

Also add `inputValue={answer}` to the Select props to make it fully controlled:
```typescript
<Select<AnswerSelectOption, false>
  classNamePrefix="answer-select"
  inputId="answer-select-input"
  unstyled
  options={answerSelectOptions}
  value={selectedAnswerOption}
  inputValue={answer}
  onInputChange={(inputValue: string, actionMeta: InputActionMeta) => {
    if (actionMeta.action === "input-change") {
      setAnswer(inputValue.slice(0, 80));
    }
  }}
  onChange={(option: SingleValue<AnswerSelectOption>) => {
    if (!option) {
      setAnswer("");
      return;
    }
    setAnswer(option.value.slice(0, 80));
  }}
  // ... rest of props
/>
```

**Step 4: Test manually**

1. Type quickly and press Enter — verify the typed text is submitted, not a stale suggestion
2. Select an option, then backspace to clear — verify the text clears immediately
3. Verify debounce doesn't make suggestions feel too slow (250ms)

**Step 5: Commit**

```bash
git add apps/web/src/routes/room/\$roomCode/play.tsx
git commit -m "fix: autocomplete race condition and clear behavior

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Deduplicate season names in autocomplete

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/api/src/services/AnimeAutocomplete.ts`

**Step 1: Add franchise deduplication utility**

Add this function near the top of play.tsx (near `normalizeChoiceLabel`):

```typescript
const SEASON_SUFFIX_PATTERN =
  /\s*(?:Season\s*\d+|Part\s*\d+|\d+(?:st|nd|rd|th)\s*Season|Cour\s*\d+|S\d+|:\s*(?:The\s+)?(?:Final|Second|Third)\s*(?:Season|Part|Cour).*|(?:2nd|3rd)\s+Season.*)$/i;

function extractFranchiseBase(title: string): string {
  return title.replace(SEASON_SUFFIX_PATTERN, "").trim();
}
```

**Step 2: Apply deduplication in answerSelectOptions useMemo**

Modify the `answerSelectOptions` useMemo (line 727):

```typescript
const answerSelectOptions = useMemo<AnswerSelectOption[]>(() => {
  if (typedAnswer.length < 1) return [];
  const fromApi = animeAutocompleteQuery.data?.suggestions ?? [];
  const rankedPool = rankAnswerSuggestions(answerSuggestionPool, typedAnswer);
  const values = [...fromApi.map((item) => item.label), ...rankedPool];
  const deduped: AnswerSelectOption[] = [];
  const seen = new Set<string>();
  const seenFranchises = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length <= 0) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const franchise = extractFranchiseBase(normalized).toLowerCase();
    if (seenFranchises.has(franchise)) continue;
    seenFranchises.add(franchise);
    deduped.push({ value: normalized, label: normalized });
  }
  return deduped;
}, [animeAutocompleteQuery.data?.suggestions, answerSuggestionPool, typedAnswer]);
```

**Step 3: Also deduplicate on API side (AnimeAutocomplete.ts)**

In `AnimeAutocomplete.ts`, after deduplication by `animeId` (around line 88-101), add franchise-level deduplication:

```typescript
// After existing deduplication by animeId
const franchiseDeduped = new Map<string, AnimeSuggestion>();
for (const [, suggestion] of deduped) {
  const franchise = suggestion.label
    .replace(/\s*(?:Season\s*\d+|Part\s*\d+|\d+(?:st|nd|rd|th)\s*Season|Cour\s*\d+|S\d+|:\s*(?:The\s+)?(?:Final|Second|Third)\s*(?:Season|Part|Cour).*|(?:2nd|3rd)\s+Season.*)$/i, "")
    .trim()
    .toLowerCase();
  const existing = franchiseDeduped.get(franchise);
  if (existing && existing.score <= suggestion.score) continue;
  franchiseDeduped.set(franchise, suggestion);
}
return [...franchiseDeduped.values()]
  .sort((a, b) => a.score - b.score)
  .slice(0, limit);
```

**Step 4: Run tests**

```bash
bun test apps/api/src/services/AnimeAutocomplete
```

**Step 5: Commit**

```bash
git add apps/web/src/routes/room/\$roomCode/play.tsx apps/api/src/services/AnimeAutocomplete.ts
git commit -m "feat: deduplicate season variants in autocomplete suggestions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Clean up randomization + add logging

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts`

**Step 1: Remove redundant double-randomization**

In `buildAniListUnionTrackPool` (line 1109), the SQL already does `ORDER BY random()`, then `randomShuffle()` is applied again. Remove the JS shuffle:

```typescript
// BEFORE (line 1109):
const tracks: MusicTrack[] = randomShuffle(selected.rows).map((row) => {

// AFTER:
const tracks: MusicTrack[] = selected.rows.map((row) => {
```

**Step 2: Add pool size logging**

After building the track pool, log the pool size vs rounds requested. In `buildAniListUnionTrackPool`, before the return:

```typescript
console.log(
  `[RoomStore] AniList pool built: ${tracks.length} candidates for ${safeRounds} rounds (${animeIds.length} anime IDs from ${userIds.length} users)`,
);
```

**Step 3: Add inter-game memory for "Rejouer"**

In `RoomSession` type, add a field to track recently played track signatures:

```typescript
recentTrackSignatures: Set<string>;
```

Initialize it in `createRoom`:
```typescript
recentTrackSignatures: new Set<string>(),
```

In `splitAnswerAndDistractorPools`, after selecting answer tracks, add their signatures to the set. In `buildAniListUnionTrackPool`, filter out recent tracks:

```typescript
const freshTracks = tracks.filter(
  (track) => !session.recentTrackSignatures.has(trackSignature(track)),
);
// Use freshTracks if it has enough, otherwise fall back to all tracks
const pool = freshTracks.length >= safeRounds ? freshTracks : tracks;
```

After a game ends, record the played tracks:
```typescript
for (const track of session.trackPool.slice(0, session.totalRounds)) {
  session.recentTrackSignatures.add(trackSignature(track));
}
```

**Step 4: Run tests**

```bash
bun test apps/api/src/services/RoomStore
```

**Step 5: Commit**

```bash
git add apps/api/src/services/RoomStore.ts
git commit -m "refactor: clean up redundant randomization, add pool logging and inter-game memory

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Equitable AniList distribution (round-robin)

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts`
- Modify: `apps/api/src/repositories/UserAnimeLibraryRepository.ts`

**Step 1: Add per-user anime lookup method**

In `UserAnimeLibraryRepository.ts`, add a method alongside `unionAnimeIdsForUsers`:

```typescript
async animeIdsForUser(userId: string, limit: number): Promise<number[]> {
  const result = await pool.query<{ anime_id: number }>(
    `SELECT DISTINCT ual.anime_id
     FROM user_anime_library ual
     WHERE ual.user_id = $1
     ORDER BY ual.anime_id
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map((row) => row.anime_id);
}
```

**Step 2: Refactor buildAniListUnionTrackPool to round-robin**

Replace the single union query with per-user queries and round-robin selection:

```typescript
private async buildAniListUnionTrackPool(session: RoomSession, requestedRounds: number) {
  const safeRounds = Math.max(1, requestedRounds);
  const targetCandidateSize = this.targetCandidatePoolSize(safeRounds);
  const userIds = [...session.players.values()]
    .map((player) => player.userId)
    .filter((userId): userId is string => typeof userId === "string" && userId.length > 0);

  if (userIds.length <= 0) {
    return { tracks: [], distractorTracks: [], candidateCount: 0, rawTotal: 0, playableTotal: 0, cleanTotal: 0 };
  }

  // Step 1: Get anime IDs per user
  const animeLookupLimit = Math.min(20_000, Math.max(targetCandidateSize * 30, 2_000));
  const perUserAnimeIds = await Promise.all(
    userIds.map((userId) => userAnimeLibraryRepository.animeIdsForUser(userId, animeLookupLimit)),
  );

  // Step 2: Calculate per-user quotas (strict equal)
  const baseQuota = Math.floor(safeRounds / userIds.length);
  const remainder = safeRounds % userIds.length;
  const quotas = userIds.map((_, i) => baseQuota + (i < remainder ? 1 : 0));

  // Step 3: Query tracks per user and pick quota
  const themeCondition = session.themeMode === "op_only" ? "and tv.theme_type = 'OP'"
    : session.themeMode === "ed_only" ? "and tv.theme_type = 'ED'" : "";

  const allTracks: MusicTrack[] = [];
  const usedAnimeIds = new Set<number>();
  let unfulfilled = 0;

  for (let i = 0; i < userIds.length; i++) {
    const animeIds = perUserAnimeIds[i]!.filter((id) => !usedAnimeIds.has(id));
    if (animeIds.length <= 0) {
      unfulfilled += quotas[i]!;
      continue;
    }
    const tracks = await this.queryAnimeThemeTracks(animeIds, quotas[i]! * 3, themeCondition, session);
    const selected = tracks.slice(0, quotas[i]!);
    for (const track of selected) {
      allTracks.push(track);
      // Mark anime as used to avoid cross-user duplicates
      const animeId = animeIds.find(() => true); // track's anime
    }
    if (selected.length < quotas[i]!) {
      unfulfilled += quotas[i]! - selected.length;
    }
  }

  // Step 4: Fill unfulfilled slots from union pool
  if (unfulfilled > 0) {
    const unionAnimeIds = [...new Set(perUserAnimeIds.flat())];
    const usedSignatures = new Set(allTracks.map(trackSignature));
    const extraTracks = await this.queryAnimeThemeTracks(unionAnimeIds, unfulfilled * 3, themeCondition, session);
    for (const track of extraTracks) {
      if (allTracks.length >= safeRounds) break;
      if (usedSignatures.has(trackSignature(track))) continue;
      usedSignatures.add(trackSignature(track));
      allTracks.push(track);
    }
  }

  // Step 5: Shuffle and split
  const shuffled = randomShuffle(allTracks);
  // ... continue with existing splitAnswerAndDistractorPools logic
}
```

Note: Extract the SQL query from the existing function into a reusable `queryAnimeThemeTracks(animeIds, limit, themeCondition, session)` private method.

**Step 3: Add logging**

```typescript
console.log(
  `[RoomStore] AniList round-robin: ${userIds.length} users, quotas=[${quotas.join(",")}], ` +
  `${allTracks.length} tracks selected for ${safeRounds} rounds`,
);
```

**Step 4: Run tests**

```bash
bun test apps/api
```

**Step 5: Commit**

```bash
git add apps/api/src/services/RoomStore.ts apps/api/src/repositories/UserAnimeLibraryRepository.ts
git commit -m "feat: equitable round-robin AniList distribution across players

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 2 — Advanced Room Settings

### Task 8: Configurable round parameters

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts` — add `roundConfig` to `RoomSession`
- Modify: `apps/api/src/services/RoomManager.ts` — use `roundConfig` instead of hardcoded defaults
- Modify: `apps/api/src/routes/quiz.ts` — new endpoint `POST /quiz/settings/round-config`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx` — settings UI in lobby
- Modify: `apps/web/src/styles.css` — settings UI styles
- Modify: `apps/web/src/lib/api.ts` — new API call

**Step 1: Add RoundConfig type and session field**

In `RoomStore.ts`, add:

```typescript
type RoomRoundConfig = {
  playingMs: number;    // 10000 | 15000 | 20000 | 30000
  maxRounds: number;    // 5 | 10 | 15 | 20
  revealMs: number;     // 5000 | 10000 | 15000 | 20000
};

const ROUND_CONFIG_OPTIONS = {
  playingMs: [10_000, 15_000, 20_000, 30_000],
  maxRounds: [5, 10, 15, 20],
  revealMs: [5_000, 10_000, 15_000, 20_000],
} as const;
```

Add `roundConfig: RoomRoundConfig` to `RoomSession` type. Default:
```typescript
roundConfig: { playingMs: 20_000, maxRounds: 10, revealMs: 10_000 },
```

**Step 2: Wire RoomManager to use session config**

In `RoomManager.ts`, wherever `DEFAULT_ROUND_CONFIG.playingMs`, `.maxRounds`, `.revealMs` are used, read from the session's `roundConfig` instead.

**Step 3: Add API endpoint**

In `quiz.ts`, add:
```typescript
.post("/settings/round-config", ({ body, set }) => {
  const roomCode = readStringField(body, "roomCode");
  const playerId = readStringField(body, "playerId");
  const playingMs = readNumberField(body, "playingMs");
  const maxRounds = readNumberField(body, "maxRounds");
  const revealMs = readNumberField(body, "revealMs");
  // Validate values against ROUND_CONFIG_OPTIONS
  // Call roomStore.setRoomRoundConfig(roomCode, playerId, config)
  return { ok: true };
})
```

**Step 4: Add lobby UI**

In the lobby section of play.tsx (around line 2418), add a "Paramètres de round" section with button groups:

```tsx
<div className="field-block">
  <span className="field-label">Durée de devinette</span>
  <div className="setting-toggle-group">
    {[10, 15, 20, 30].map((sec) => (
      <button
        key={sec}
        className={`setting-toggle${roundConfig.playingMs === sec * 1000 ? " active" : ""}`}
        onClick={() => updateRoundConfig({ playingMs: sec * 1000 })}
      >
        {sec}s
      </button>
    ))}
  </div>
</div>
```

Repeat for maxRounds and revealMs.

**Step 5: Add CSS for setting toggle groups**

```css
.setting-toggle-group {
  display: flex;
  gap: 4px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--line);
}

.setting-toggle {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: none;
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
}

.setting-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
}

.setting-toggle.active {
  background: rgba(54, 214, 180, 0.22);
  color: var(--accent-b);
  font-weight: 700;
}
```

**Step 6: Add API client function**

In `api.ts`:
```typescript
export async function setRoomRoundConfig(input: {
  roomCode: string;
  playerId: string;
  playingMs: number;
  maxRounds: number;
  revealMs: number;
}) {
  return requestJson<{ ok: true }>("/quiz/settings/round-config", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

**Step 7: Expose config in room snapshot**

In the snapshot serializer (RoomStore.ts), include `roundConfig` so the frontend can display current values.

**Step 8: Run tests and commit**

```bash
bun test && git add -A && git commit -m "feat: configurable round duration, number of rounds, and reveal time

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Configurable answer mode (MCQ / Text / Mixed)

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts` — add `answerMode` field
- Modify: `apps/api/src/services/RoomManager.ts` — respect `answerMode` for round mode selection
- Modify: `apps/api/src/routes/quiz.ts` — new endpoint
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx` — lobby UI
- Modify: `apps/web/src/lib/api.ts` — API call

**Step 1: Add type and field**

```typescript
type AnswerMode = "mcq_only" | "text_only" | "mixed";
```

Add `answerMode: AnswerMode` to `RoomSession`, default `"mixed"`.

**Step 2: Wire RoomManager**

In the round mode selection logic of `RoomManager.ts`, force the mode based on `answerMode`:
- `mcq_only` → always "mcq"
- `text_only` → always "text"
- `mixed` → existing alternating logic

**Step 3: Add API endpoint, UI, and client function**

Follow same pattern as Task 8. 3 toggle buttons: "QCM", "Texte", "Mix".

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: configurable answer mode (MCQ/Text/Mixed)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Difficulty filter (AniList popularity)

**Files:**
- Create: new migration in `scripts/` — add `anilist_popularity` column
- Modify: `apps/api/src/services/AnimeThemesCatalogService.ts` — fetch popularity from AniList GraphQL
- Modify: `apps/api/src/services/RoomStore.ts` — add `difficulty` filter, WHERE condition
- Modify: `apps/api/src/routes/quiz.ts` — endpoint
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx` — UI
- Modify: `apps/web/src/lib/api.ts` — API call

**Step 1: Database migration**

Create migration file:
```sql
ALTER TABLE anime_catalog_anime
ADD COLUMN anilist_popularity integer DEFAULT NULL;

CREATE INDEX idx_anime_catalog_anilist_popularity
ON anime_catalog_anime (anilist_popularity)
WHERE anilist_popularity IS NOT NULL;
```

Run: `bun run db:migrate`

**Step 2: Enrich catalog with AniList popularity**

In `AnimeThemesCatalogService.ts`, after syncing anime from AnimeThemes, batch-fetch popularity from AniList's GraphQL API:

```typescript
const ANILIST_GRAPHQL = "https://graphql.anilist.co";

async function fetchAniListPopularity(titles: string[]): Promise<Map<string, number>> {
  // Use AniList search query to find popularity for each anime
  // Batch using AniList's Page query to respect rate limits (90 req/min)
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        title { romaji }
        popularity
      }
    }
  `;
  // ... batch implementation with rate limiting
}
```

Store results: `UPDATE anime_catalog_anime SET anilist_popularity = $1 WHERE id = $2`

**Step 3: Add difficulty filter to room**

Type: `type DifficultyFilter = "easy" | "medium" | "hard" | "all";`

Thresholds:
```typescript
const DIFFICULTY_THRESHOLDS = {
  easy: 100_000,   // popularity >= 100k
  medium: 30_000,  // popularity >= 30k and < 100k
  hard: 0,         // popularity < 30k
} as const;
```

Add WHERE clause in the theme selection SQL:
```sql
-- For easy:
AND aa.anilist_popularity >= 100000
-- For medium:
AND aa.anilist_popularity >= 30000 AND aa.anilist_popularity < 100000
-- For hard:
AND aa.anilist_popularity < 30000
-- For all: no filter
```

**Step 4: Add UI in lobby**

4 toggle buttons: 🟢 Facile, 🟡 Moyen, 🔴 Difficile, Tous

**Step 5: Run migration, tests, commit**

```bash
bun run db:migrate && bun test && git add -A
git commit -m "feat: difficulty filter based on AniList popularity

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Content filters (decade, genre)

**Files:**
- Create: migration — add `year`, `genres` columns to `anime_catalog_anime`
- Modify: `apps/api/src/services/AnimeThemesCatalogService.ts` — extract year + genres
- Modify: `apps/api/src/services/RoomStore.ts` — filter SQL
- Modify: `apps/api/src/routes/quiz.ts` — endpoints
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx` — UI
- Modify: `apps/web/src/styles.css` — filter UI styles

**Step 1: Database migration**

```sql
ALTER TABLE anime_catalog_anime
ADD COLUMN year integer DEFAULT NULL,
ADD COLUMN genres text[] DEFAULT '{}';

CREATE INDEX idx_anime_catalog_year ON anime_catalog_anime (year) WHERE year IS NOT NULL;
CREATE INDEX idx_anime_catalog_genres ON anime_catalog_anime USING GIN (genres);
```

**Step 2: Enrich catalog**

AnimeThemes API includes `year` and `season` for each anime. AniList provides `genres`. Extract both during catalog refresh.

**Step 3: Add filters to RoomSession**

```typescript
contentFilters: {
  yearRange: [number, number] | null;  // e.g., [2010, 2020]
  genres: string[] | null;             // e.g., ["Action", "Romance"]
};
```

**Step 4: Add WHERE conditions**

```sql
-- Year filter:
AND aa.year >= $yearMin AND aa.year <= $yearMax
-- Genre filter (any match):
AND aa.genres && $genres::text[]
```

**Step 5: Add UI**

- Decade: Button group (90s, 2000s, 2010s, 2020s, Tous) — can select multiple
- Genre: Multi-select pill buttons with popular genres

**Step 6: Run migration, tests, commit**

```bash
bun run db:migrate && bun test && git add -A
git commit -m "feat: content filters by decade and genre

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: Lives system

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts` — `livesMode`, `maxLives` in session; `lives`, `isEliminated` in Player
- Modify: `apps/api/src/services/RoomManager.ts` — decrement lives, elimination logic, early game end
- Modify: `apps/api/src/routes/quiz.ts` — settings endpoint
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx` — UI hearts, eliminated state, spectator mode
- Modify: `apps/web/src/styles.css` — hearts styling

**Step 1: Add types**

In `RoomStore.ts`:
```typescript
// In RoomSession:
livesMode: boolean;      // default: false
maxLives: number;        // default: 3

// In Player:
lives: number;           // initialized to maxLives
isEliminated: boolean;   // default: false
```

**Step 2: Implement lives logic in RoomManager**

In the scoring/answer evaluation:
```typescript
if (session.livesMode && !playerState.isCorrect && !player.isEliminated) {
  player.lives -= 1;
  if (player.lives <= 0) {
    player.isEliminated = true;
  }
}
```

Skip eliminated players in answer collection. Check for early game end:
```typescript
const alivePlayers = [...session.players.values()].filter((p) => !p.isEliminated);
if (session.livesMode && alivePlayers.length <= 1) {
  // Trigger results phase
}
```

**Step 3: Add UI**

In leaderboard, show hearts: `{"❤️".repeat(player.lives)}` or `{"🖤".repeat(maxLives - player.lives)}`

For eliminated player: disable answer input, show "Éliminé ! Mode spectateur" banner.

**Step 4: Tests and commit**

```bash
bun test && git add -A
git commit -m "feat: lives system with elimination and spectator mode

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 13: Team mode

**Files:**
- Modify: `apps/api/src/services/RoomStore.ts` — `teamMode`, `teams`, `teamCount` in session
- Modify: `apps/api/src/services/RoomManager.ts` — team scoring aggregation
- Modify: `apps/api/src/routes/quiz.ts` — settings endpoints
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx` — team assignment UI, team leaderboard, team podium
- Modify: `apps/web/src/styles.css` — team colors, team podium

**Step 1: Add types**

```typescript
type Team = {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
};

// In RoomSession:
teamMode: boolean;      // default: false
teamCount: number;       // 2 | 3 | 4, default: 2
teams: Team[];
```

Team colors palette:
```typescript
const TEAM_COLORS = ["#ff8c37", "#36d6b4", "#ffe86f", "#ff5f7a"];
const TEAM_NAMES = ["Équipe A", "Équipe B", "Équipe C", "Équipe D"];
```

**Step 2: Auto-assign players to teams**

When host enables team mode or players join:
```typescript
function autoAssignTeams(players: Player[], teamCount: number): Team[] {
  const shuffled = randomShuffle([...players]);
  const teams: Team[] = Array.from({ length: teamCount }, (_, i) => ({
    id: `team-${i}`,
    name: TEAM_NAMES[i]!,
    color: TEAM_COLORS[i]!,
    playerIds: [],
  }));
  shuffled.forEach((player, i) => {
    teams[i % teamCount]!.playerIds.push(player.id);
  });
  return teams;
}
```

**Step 3: Aggregate team scoring**

In RoomManager, after individual scoring:
```typescript
const teamScores = session.teams.map((team) => ({
  ...team,
  score: team.playerIds.reduce((sum, pid) => {
    const player = session.players.get(pid);
    return sum + (player?.score ?? 0);
  }, 0),
}));
```

Include team leaderboard in snapshot.

**Step 4: Adapt podium for teams**

When `teamMode` is active, the podium shows team names + aggregated scores instead of individual players.

**Step 5: Add lobby UI**

Toggle button for team mode. If active, show team count selector (2/3/4) and team assignments.

**Step 6: Tests and commit**

```bash
bun test && git add -A
git commit -m "feat: team mode with auto-assignment and aggregated scoring

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Testing Strategy

- **Unit tests**: Run `bun test` after each task
- **E2E tests**: Run `bun run test:e2e` after completing each phase
- **Manual testing**: Start dev servers (`bun run dev:api` + `bun run dev:web`) and play through a game after each task
- **Lint**: Run `bun run lint` before each commit
