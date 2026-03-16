# Random Anime Blindtest Design

**Date:** 2026-03-13
**Status:** Approved
**Scope:** Add a classic anime blindtest mode that does not use the room players' AniList libraries as the content source, while preserving strong randomness as a first-class gameplay property across the application.

---

## 1. Product Direction

Kwizik adds a **classic random anime** mode for players who want a blindtest experience that is not shaped by their own AniList libraries.

Fixed foundations:
- The new mode must **not** source its anime pool from the linked AniList libraries of the room players.
- The pool must be built from a **fresh remote anime source** and then mapped to playable AnimeThemes entries.
- **Randomness is the most important product property** for this mode.
- The randomness requirement also applies more broadly to the application: even when AniList-backed modes are used, the gameplay should avoid deterministic-feeling small-pool reuse and preserve a genuinely random blindtest experience.

Out of scope:
- Excluding anime that already appear in a player's AniList library.
- Silently degrading the new mode into an AniList-union or local-catalog mode.
- Reusing a prebuilt selection pool across games in a way that would reduce randomness.

---

## 2. Final Decisions (Validated)

- Room source mode: add a dedicated **classic random anime** source mode.
- Source strategy: **fresh remote draw per game**, not a reused global pool.
- Pool generation: fetch remote anime candidates, map them to AnimeThemes-playable entries, and keep drawing until the game has a sufficient unique playable pool.
- Fallback policy: **no fallback selection pool** reused between games.
- Cache policy: only allow **technical metadata caching** that does not influence which anime are selected for a game.
- UX contract: if the user chooses the classic random mode, the backend must stay on that contract and never silently serve a different source.
- Filters: reuse existing room filters where they still make sense for the new source mode.
- App-wide randomness principle: candidate-pool construction elsewhere in the app should continue to bias toward wide, unbiased random draws rather than narrow repeated subsets.

---

## 3. Architecture

### 3.1 New Room Source Mode

Add a new room source mode, e.g. `random_classic`, exposed end-to-end:
- room state / snapshot types
- host room settings UI
- API validation for room settings
- track source parsing / resolution

This mode writes a dedicated source query value so the round-building pipeline can keep reusing the existing gameplay engine while swapping only the source-pool construction path.

### 3.2 Resolver Shape

Add a dedicated resolver branch for the new source mode.

Responsibilities:
1. Generate a per-game random seed.
2. Fetch candidate anime from a remote source that is not the room users' libraries.
3. Randomize across a broad enough search space to avoid small deterministic subsets.
4. Map those candidates to AnimeThemes-playable entries.
5. Continue drawing until the game has enough unique playable anime for the requested rounds plus safety margin.

### 3.3 Cache Boundaries

Allowed:
- short-lived metadata memoization for remote lookups
- mapping caches that speed up AniList/AnimeThemes joins
- rate-limit protection caches that do not preselect the next game pool

Forbidden:
- reusing a prior game's selected anime pool as the next game's source
- keeping a persistent fallback pool that quietly becomes the effective source of truth

---

## 4. Gameplay Flow

### 4.1 Classic Random Mode

On game start:
1. The room is configured with `random_classic`.
2. The backend generates a fresh random seed for this game.
3. The resolver fetches remote anime candidates from a global source.
4. It maps candidates onto playable AnimeThemes entries.
5. It deduplicates by canonical anime identity.
6. If the pool is still too small, it keeps drawing from additional random remote slices until the target is met.
7. The game then samples rounds from this freshly built per-game pool.

### 4.2 Randomness Invariants

The new mode must preserve these invariants:
- each game starts from a **fresh random draw**
- no previous game pool is reused as the effective source
- enough candidate breadth is gathered before round sampling, so the result feels random in practice, not only in theory

These invariants should also inform existing AniList-backed gameplay, so room starts do not regress toward narrow sampled subsets that create repeated openings or repeated MCQ choices.

---

## 5. Frontend and API Surfaces

### 5.1 Frontend

Add a new host-selectable room source button in the lobby/play screen:
- label: classic random anime mode
- no dependency on linked-player library state
- reuse existing room settings persistence and replay flows

### 5.2 Backend

Primary insertion points:
- room source mode typing and snapshot exposure
- room settings mutation / validation
- track source parser and resolver
- room-start pool construction path

The round engine, reveal flow, answer checking, and theme playback logic should remain as unchanged as possible.

---

## 6. Error Handling and Reliability

Product priority is randomness over hidden resilience tricks.

Therefore:
- do **not** silently swap to AniList-union, local catalog, or any other source
- do **not** reuse a previous selection pool as a convenience fallback
- do **not** let a cache become the normal gameplay source

Instead, reliability should come from making the primary path robust:
- overfetch broadly enough from the remote source
- continue drawing until the playable target is reached
- cache only non-selection technical metadata
- bound remote work carefully so the UX remains responsive without degrading the source contract

---

## 7. Testing Strategy

### Unit / Integration

- new source mode parsing and room-setting validation
- resolver behavior for `random_classic`
- canonical anime deduplication in the freshly built pool
- continued remote draw until the playable target is reached
- proof that technical caches do not override per-game randomness

### Room / Gameplay

- host can select the new mode and the setting persists correctly
- a game can start in classic random mode without linked-player AniList libraries
- the built pool contains enough unique playable anime for the configured rounds
- the mode never degrades into another source mode

### Regression Coverage

- existing AniList random draw tests should remain green
- expand coverage where needed so app-wide random selection avoids narrow repeated subsets

---

## 8. Implementation Notes

- Prefer a surgical addition to the existing room source architecture rather than a parallel gameplay system.
- Keep the distinction clear between:
  - **selection randomness** (must be fresh per game)
  - **technical caching** (allowed only when it does not influence selection outcomes)
- If remote-source limitations appear during implementation, preserve the validated product contract: randomness first, no silent fallback pool.
