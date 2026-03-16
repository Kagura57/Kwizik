# Home Page Harmony Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the marketing and room-entry hierarchy of the localized home page so it feels intentional, balanced, and conversion-oriented without changing the existing join/create/public-room behaviors.

**Architecture:** Keep the existing route-level data and mutations in `apps/web/src/routes/index.tsx`, but reorganize the rendered sections into a hero-first landing page with a shared room-actions panel, a full-width public-room feed, and a calmer editorial section. Replace the current generic home grid usage with dedicated home-page CSS in `apps/web/src/styles.css` so the composition and responsive behavior are explicit instead of emerging from reused utility layouts.

**Tech Stack:** React, TanStack Query, TanStack Router, TypeScript, shared global CSS, Bun test/build pipeline

---

### Task 1: Capture the new home composition in the route

**Files:**
- Modify: `apps/web/src/routes/index.tsx`
- Verify: `apps/web/src/routes/index.tsx`

**Step 1: Keep the existing room mutations and localized copy intact**

- Preserve `createRoomMutation`, `joinMutation`, and the public room query so the refactor only changes presentation and section hierarchy.

**Step 2: Replace the top-level JSX composition**

- Introduce a dedicated hero section with:
  - a stronger `h1`
  - supporting copy
  - a small set of trust/value bullets
  - a compact live-room summary band
- Move `Join` and `Create` into a shared side panel that still exposes both flows clearly.

**Step 3: Rework the public rooms section**

- Render public rooms as their own full-width section with a titled header and clearer row layout.
- Preserve the same CTA behavior through `onJoinPublicRoom`.

**Step 4: Reformat the SEO/editorial content block**

- Split `How it works`, `Why Kwizik`, and `FAQ` into an editorial grid instead of one long stacked card.

**Step 5: Run route-focused validation**

Run: `bun test apps/web/src/routes`
Expected: PASS

### Task 2: Rebuild the home page CSS around explicit layout primitives

**Files:**
- Modify: `apps/web/src/styles.css`
- Verify: `apps/web/src/styles.css`

**Step 1: Add dedicated home-page layout classes**

- Add explicit classes for:
  - hero shell
  - hero content
  - room actions shell
  - stats/value chips
  - public room rows
  - editorial grid

**Step 2: Remove dependence on the old “two cards and single-panel” composition**

- Keep shared panel/button/input tokens, but stop relying on `.home-grid-balanced`, `.home-top-grid`, and `.single-panel` for the new landing page hierarchy.

**Step 3: Tune responsive behavior deliberately**

- At tablet widths, collapse the hero and actions column into one column.
- On mobile, tighten spacing, keep CTAs full-width, and preserve readable room rows without cramped controls.

**Step 4: Run a production build**

Run: `cd apps/web && bun run build`
Expected: PASS

### Task 3: Polish and verify the page as a product surface

**Files:**
- Modify: `tasks/todo.md`
- Verify: `apps/web/src/routes/index.tsx`
- Verify: `apps/web/src/styles.css`

**Step 1: Perform a polish pass**

- Check visual rhythm, heading scale, CTA prominence, room-row alignment, and spacing between major sections.

**Step 2: Verify with targeted commands**

Run: `bun test apps/web/src/routes`
Expected: PASS

Run: `cd apps/web && bun run build`
Expected: PASS

**Step 3: Document the result**

- Mark the `Home Page Harmony Refresh` checklist as complete in `tasks/todo.md`.
- Add a short review section summarizing the layout changes and the verification results.
