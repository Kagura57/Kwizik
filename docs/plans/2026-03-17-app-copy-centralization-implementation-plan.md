# App Copy Centralization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize all web-app UI copy into dedicated i18n modules and rewrite the current wording so it is shorter, clearer, and more consistent in French and English.

**Architecture:** Add a dedicated copy layer in `apps/web/src/i18n/copy/`, then replace route-local copy objects and locale-specific helper functions with typed imports. Keep behavior unchanged and limit the refactor to the web app’s authored text and message formatting.

**Tech Stack:** React, TypeScript, TanStack Router, TanStack Query, Bun, existing `apps/web/src/i18n` locale utilities

---

### Task 1: Add the shared copy-layer scaffolding

**Files:**
- Create: `apps/web/src/i18n/copy/index.ts`
- Create: `apps/web/src/i18n/copy/types.ts`

**Step 1: Write the minimal locale typing helpers**

Add a shared `LocalizedCopy<T>` type based on `SupportedLocale` and a tiny `pickCopy` helper.

**Step 2: Export the shared helper surface**

Re-export the shared types/functions from `apps/web/src/i18n/copy/index.ts`.

**Step 3: Run a type-oriented sanity check**

Run: `cd apps/web && bun run build`
Expected: PASS or later failures only from missing route imports that will be addressed by following tasks.

### Task 2: Centralize shell and small-route copy

**Files:**
- Create: `apps/web/src/i18n/copy/root.ts`
- Create: `apps/web/src/i18n/copy/join.ts`
- Create: `apps/web/src/i18n/copy/auth.ts`
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/routes/join.tsx`
- Modify: `apps/web/src/routes/auth.tsx`

**Step 1: Move route-local copy into dedicated modules**

Extract:

- topbar labels and sign-out messages from `__root.tsx`
- join-page labels and join error helper from `join.tsx`
- auth-page labels and auth error helper from `auth.tsx`

**Step 2: Rewrite the wording while extracting**

Shorten and normalize the most awkward copy during extraction, especially:

- form subtitles
- CTA labels
- sign-in/sign-up mode descriptions
- room-join errors

**Step 3: Replace inline route copy with imported getters**

Update the routes to resolve their copy from the new modules.

**Step 4: Run focused route tests**

Run: `bun test apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx`
Expected: PASS

### Task 3: Centralize home-page copy

**Files:**
- Create: `apps/web/src/i18n/copy/home.ts`
- Modify: `apps/web/src/routes/index.tsx`

**Step 1: Extract home copy and helper formatters**

Move:

- page copy object
- join-room error helper
- room-state formatter

into `home.ts`.

**Step 2: Rewrite the home wording**

Tighten:

- hero copy
- console/section subtitles
- room-feed labels
- SEO body copy where wording is currently awkward or too heavy

**Step 3: Rewire the route**

Update the home route to use the central copy module only.

**Step 4: Run focused route tests**

Run: `bun test apps/web/src/routes/routes.spec.tsx apps/web/src/routes/seo.spec.tsx`
Expected: PASS

### Task 4: Centralize settings-page copy

**Files:**
- Create: `apps/web/src/i18n/copy/settings.ts`
- Modify: `apps/web/src/routes/settings.tsx`

**Step 1: Extract settings copy and status/error helpers**

Move:

- page copy object
- AniList status meta
- sync state labels
- sync/update error helpers

into `settings.ts`.

**Step 2: Rewrite the settings wording**

Tighten:

- status descriptions
- sync guidance
- preference labels
- success/error feedback

**Step 3: Rewire the route**

Update the settings route to use the centralized helpers.

**Step 4: Run focused route tests**

Run: `bun test apps/web/src/routes/routes.spec.tsx`
Expected: PASS

### Task 5: Centralize room gameplay copy

**Files:**
- Create: `apps/web/src/i18n/copy/room.ts`
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`

**Step 1: Extract room-level static copy**

Move the large `copy` object from `play.tsx` into `room.ts`.

**Step 2: Extract locale-specific helper functions**

Move locale-dependent helpers from `play.tsx` into `room.ts`, including:

- missing/session/host-only messages
- source/theme/difficulty/lives labels
- snapshot/start/config/chat/answer error helpers
- room phase labels
- lobby ready-status messaging

**Step 3: Rewrite the room wording**

Shorten and normalize:

- lobby section descriptions
- live/reveal/player labels
- input placeholders
- status toasts
- waiting/reveal/final-state text

**Step 4: Rewire the route**

Replace inline locale branching with imports from `room.ts`.

**Step 5: Run focused tests**

Run: `bun test apps/web/src/routes/room-play-anime.spec.tsx apps/web/src/routes/live-gameplay.spec.tsx`
Expected: PASS

### Task 6: Centralize projection-view copy

**Files:**
- Create: `apps/web/src/i18n/copy/projection.ts`
- Modify: `apps/web/src/routes/room/$roomCode/view.tsx`

**Step 1: Extract projection copy and error helpers**

Move the inline copy object and projection error-message helpers into `projection.ts`.

**Step 2: Tighten projection wording**

Keep the projection UI especially lean and functional.

**Step 3: Rewire the route**

Replace inline locale branching with centralized imports.

**Step 4: Run focused tests**

Run: `bun test apps/web/src/routes/live-gameplay.spec.tsx`
Expected: PASS

### Task 7: Final verification and review

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run the broader verification set**

Run: `bun test apps/web/src/routes`
Expected: PASS

**Step 2: Run production build**

Run: `cd apps/web && bun run build`
Expected: PASS

**Step 3: Review the diff**

Confirm:

- route files are slimmer
- copy now lives under `apps/web/src/i18n/copy/`
- FR and EN terminology stay aligned
- no accidental behavior changes slipped in

**Step 4: Document review notes**

Update `tasks/todo.md` with what changed, what was verified, and any residual wording risk.
