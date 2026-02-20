# Remove YTMusic Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove YTMusic integration from Tunaris so YouTube search/playback uses only official YouTube API plus existing non-YTMusic fallbacks.

**Architecture:** Delete the dedicated YTMusic route and remove `ytmusic` from provider unions and resolver/aggregator flows. Keep gameplay YouTube-only behavior and no-filler policy unchanged. Update tests and UI messages to remove YTMusic references.

**Tech Stack:** Bun, TypeScript, Elysia API, React + TanStack Router, Vitest.

---

### Task 1: Remove YTMusic Provider from Backend Types and Flows

**Files:**
- Delete: `apps/api/src/routes/music/ytmusic.ts`
- Modify: `apps/api/src/services/music-types.ts`
- Modify: `apps/api/src/services/MusicAggregator.ts`
- Modify: `apps/api/src/services/TrackSourceResolver.ts`
- Modify: `apps/api/src/services/PlaybackSupport.ts`
- Modify: `apps/api/src/services/RoomStore.ts`
- Modify: `apps/api/src/routes/music/anilist.ts`

**Steps:**
1. Remove `ytmusic` provider from `MusicProvider` union.
2. Remove YTMusic search import and provider slot from aggregator maps/order.
3. Remove YTMusic branch from YouTube resolver and keep YouTube-only search resolution.
4. Keep YouTube-playable behavior for gameplay in PlaybackSupport/RoomStore.
5. Update AniList provider order to remove `ytmusic`.

### Task 2: Remove YTMusic Config Surface and UI Copy

**Files:**
- Modify: `.env.example`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/stores/gameStore.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`

**Steps:**
1. Remove `YTMUSIC_SEARCH_URL` variable/documentation from env template and diagnostics.
2. Remove `ytmusic` from frontend provider unions.
3. Keep iframe logic for YouTube only.
4. Update user error copy to remove YTMusic guidance.

### Task 3: Update Tests and Run Verification

**Files:**
- Delete: tests tied only to YTMusic route behavior.
- Modify: tests referencing `ytmusic` providers in assertions/mocks.

**Steps:**
1. Remove/adjust API tests that import the deleted YTMusic module.
2. Update provider list expectations and mocked provider maps.
3. Run targeted test suite for impacted files.
4. Run broader API tests to ensure no regression.
