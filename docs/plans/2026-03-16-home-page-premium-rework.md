# Home Page Premium Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current improved-but-still-conservative home page with a more premium landing experience built around a tighter hero, a tabbed lobby console, and a stronger live-room feed.

**Architecture:** Keep the existing room actions, query logic, and localized route behavior in `apps/web/src/routes/index.tsx`, but recompose the page into a story-led hero plus a denser room-entry console with tabs. Rebuild the home-specific CSS in `apps/web/src/styles.css` so the visual hierarchy, asymmetry, and responsive collapse are explicit and no longer depend on the first-pass generic card layout.

**Tech Stack:** React, TypeScript, TanStack Query, TanStack Router, global CSS, Bun build/test pipeline

---

### Task 1: Recompose the home route around a premium hero and tabbed console

**Files:**
- Modify: `apps/web/src/routes/index.tsx`
- Verify: `apps/web/src/routes/index.tsx`

**Step 1: Add the minimal local UI state for the console tabs**

- Introduce a `join` / `create` mode state so the home fold shows one primary room-entry flow at a time.

**Step 2: Rewrite the top fold JSX**

- Replace the current side-by-side hero and dual-flow action card with:
  - a more editorial hero with stronger hierarchy and action buttons
  - a tabbed `Lobby console` surface
  - richer supporting signal cards / feature blurbs

**Step 3: Keep the behaviors intact**

- Preserve `createRoomMutation`, `joinMutation`, `onJoinPublicRoom`, and the current localized error/success flow.

**Step 4: Rework the live-room rows**

- Present public rooms as a more premium feed with better state, count, and mode hierarchy while preserving the same join behavior.

### Task 2: Rebuild the home-specific styles for the new visual system

**Files:**
- Modify: `apps/web/src/styles.css`
- Verify: `apps/web/src/styles.css`

**Step 1: Replace the first-pass home composition styles**

- Introduce dedicated classes for:
  - story hero
  - CTA row
  - feature cards
  - signal band
  - tabbed console
  - live feed rows
  - lighter editorial strip

**Step 2: Tighten the fold**

- Reduce the feeling of vertical bloat by balancing type scale, card padding, and row density so the fold reads as one coherent unit.

**Step 3: Handle responsive collapse intentionally**

- On tablet/mobile, preserve the premium feel by stacking the hero and console in a deliberate order, keeping the tabbed console compact and the feed rows usable.

### Task 3: Verify the premium rework end to end

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run targeted checks**

Run: `bun test apps/web/src/routes`
Expected: PASS

Run: `cd apps/web && bun run build`
Expected: PASS

**Step 2: Perform browser checks**

- Validate `http://127.0.0.1:5173/en` visually in a desktop viewport.
- Validate the same page in a mobile viewport.
- Check browser console warnings/errors on the home page.

**Step 3: Record the result**

- Mark the `Home Page Premium Rework` checklist complete in `tasks/todo.md`.
- Add a concise review covering root cause, implemented visual changes, and verification evidence.
