# Anime Quiz Answer + Reveal Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve Anime Quiz answer matching and reveal UX by indexing AniList english/romaji/synonyms, accepting franchise-base answers for season/part variants, and showing AnimeThemes song metadata during reveal.

**Architecture:** Extend AniList sync to persist richer aliases in `anime_catalog_alias`, propagate aliases/song metadata into the room track/reveal payload, and strengthen `FuzzyMatcher` with season/part normalization and safer partial matching. Keep changes backward compatible by adding optional fields and preserving existing canonical flows.

**Tech Stack:** Bun, TypeScript, Elysia, PostgreSQL, React, Zustand, Vitest.

---

### Task 1: Persist AniList synonyms/english/romaji aliases (+ acronym aliases)

**Files:**
- Modify: `apps/api/src/services/jobs/anilist-sync-worker.ts`
- Modify: `apps/api/tests/anilist-sync-worker.spec.ts`

**Step 1: Write failing unit tests for alias helpers**
- Add tests for acronym generation and alias extraction dedupe/normalization behavior.

**Step 2: Run test to verify failure**
- Run: `bun test apps/api/tests/anilist-sync-worker.spec.ts`
- Expected: FAIL on missing helper behavior.

**Step 3: Implement alias enrichment in sync worker**
- Extend AniList GraphQL query to include `media.synonyms`.
- Build per-entry alias sets from `title.romaji`, `title.english`, `title.native`, `synonyms`.
- Upsert aliases into `anime_catalog_alias` as `synonym` + generated `acronym` while preserving existing `canonical` rows.

**Step 4: Run test to verify pass**
- Run: `bun test apps/api/tests/anilist-sync-worker.spec.ts`
- Expected: PASS.

**Step 5: Commit**
- `git add apps/api/src/services/jobs/anilist-sync-worker.ts apps/api/tests/anilist-sync-worker.spec.ts`
- `git commit -m "feat: enrich anilist alias indexing with synonyms and acronyms"`

### Task 2: Feed aliases into gameplay answer variants

**Files:**
- Modify: `apps/api/src/services/music-types.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Test: `apps/api/tests/room-store.spec.ts`

**Step 1: Write failing test for alias-aware text validation**
- Ensure text round accepts alias/acronym variants coming from track answer aliases.

**Step 2: Run test to verify failure**
- Run: `bun test apps/api/tests/room-store.spec.ts`
- Expected: FAIL before implementation.

**Step 3: Implement alias propagation**
- Extend `MusicTrack.answer` to support optional aliases.
- In AniList union track query, aggregate aliases from `anime_catalog_alias` and set `track.answer.aliases`.
- Include these aliases in `collectAnswerVariants`.

**Step 4: Run test to verify pass**
- Run: `bun test apps/api/tests/room-store.spec.ts`
- Expected: PASS.

**Step 5: Commit**
- `git add apps/api/src/services/music-types.ts apps/api/src/services/RoomStore.ts apps/api/tests/room-store.spec.ts`
- `git commit -m "feat: include anilist aliases in round answer variants"`

### Task 3: Improve fuzzy validation for seasons/parts + franchise matching

**Files:**
- Modify: `apps/api/src/services/FuzzyMatcher.ts`
- Modify: `apps/api/tests/answer-anime-alias.spec.ts`

**Step 1: Write failing tests**
- Add tests for:
  - `FMA` accepted for `Fullmetal Alchemist: Brotherhood`.
  - Base title accepted for season/part variants.
  - `Naruto` accepted for `Naruto Shippuden` (explicit product rule).
  - Guardrail to reduce short-token false positives.

**Step 2: Run test to verify failure**
- Run: `bun test apps/api/tests/answer-anime-alias.spec.ts`
- Expected: FAIL.

**Step 3: Implement robust normalization/comparison**
- Add season/part suffix stripping regexes.
- Add subtitle-core variant generation.
- Replace raw substring check with safer prefix/token-aware checks.
- Keep dice similarity fallback.

**Step 4: Run test to verify pass**
- Run: `bun test apps/api/tests/answer-anime-alias.spec.ts`
- Expected: PASS.

**Step 5: Commit**
- `git add apps/api/src/services/FuzzyMatcher.ts apps/api/tests/answer-anime-alias.spec.ts`
- `git commit -m "feat: accept franchise and season-agnostic anime answers"`

### Task 4: Reveal metadata (song title + artists)

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/services/AnimeThemesCatalogService.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/stores/gameStore.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Add schema fields for theme song metadata**
- Add `song_title text` and `song_artists text[]` on `anime_theme_videos` with `if not exists` migrations.

**Step 2: Extend catalog refresh ingestion**
- Include `animethemes.song.artists` in API payload typing/parsing.
- Upsert song metadata with each theme video.

**Step 3: Propagate metadata to reveal payload**
- Fetch song metadata in AniList track pool query.
- Add reveal fields in `RoomStore` payload shape.
- Extend web API types/store mapping.

**Step 4: Render song info in reveal UI**
- Add song title and artist list in reveal blocks for player + projection pages.
- Add small style block for readability over video.

**Step 5: Verify with tests/build**
- Run: `bun test apps/api/tests/answer-anime-alias.spec.ts apps/api/tests/anilist-sync-worker.spec.ts apps/api/tests/room-store.spec.ts apps/api/tests/anime-autocomplete.spec.ts`
- Expected: PASS.

**Step 6: Commit**
- `git add apps/api/src/db/schema.sql apps/api/src/services/AnimeThemesCatalogService.ts apps/api/src/services/RoomStore.ts apps/web/src/lib/api.ts apps/web/src/stores/gameStore.ts apps/web/src/routes/room/$roomCode/play.tsx apps/web/src/routes/room/$roomCode/view.tsx apps/web/src/styles.css`
- `git commit -m "feat: expose animethemes song metadata in reveal"`

