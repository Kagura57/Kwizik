# Room Page Premium Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the room page so the lobby feels like a clear control room for hosts and the live phase feels like a focused premium arena, without changing room gameplay behavior.

**Architecture:** Keep all room state, mutations, and realtime behavior in `apps/web/src/routes/room/$roomCode/play.tsx`, but reorganize the rendered lobby and live sections into more deliberate compositions. Rework the corresponding room styles in `apps/web/src/styles.css` so the page has distinct `lobby control room` and `live arena` surfaces instead of a single technical dashboard layout.

**Tech Stack:** React, TypeScript, TanStack Query, realtime room snapshot flow, global CSS, Bun build/test pipeline

---

### Task 1: Recompose the room route around clearer lobby and live surfaces

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`

**Step 1: Add any minimal presentation-only labels/state needed**

- Keep the current room logic intact.
- Add only small presentation helpers or localized copy needed for new section titles and status groupings.

**Step 2: Rebuild the waiting lobby markup**

- Turn the lobby into:
  - a room summary / intro band
  - grouped host controls by category
  - a distinct ready/start action area
  - a dedicated side rail for room summary and players

**Step 3: Rebuild the live arena markup**

- Keep the central gameplay and side rails, but restructure them with clearer headers and panel grouping so the center stage dominates and the rails support it instead of competing with it.

### Task 2: Rebuild the room styles around the new hierarchy

**Files:**
- Modify: `apps/web/src/styles.css`

**Step 1: Add control-room layout styles**

- Define dedicated classes for:
  - room header band
  - lobby layout columns
  - grouped setting cards
  - side rail summaries
  - action zones

**Step 2: Add live-arena refinement styles**

- Strengthen the center stage, compact the rails, and improve the visual treatment of the leaderboard, chat, reveal, and results panels.

**Step 3: Tune responsive behavior**

- Ensure tablet/mobile reflow preserves a strong reading order instead of devolving into a dense stack of generic cards.

### Task 3: Verify the room rework

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run targeted checks**

Run: `bun test apps/web/src/routes`
Expected: PASS

Run: `cd apps/web && bun run build`
Expected: PASS

**Step 2: Perform browser checks**

- Open a room in lobby state and inspect the desktop composition.
- Inspect the same room or another room in a narrow/mobile viewport.
- If a live room is available locally, inspect the live arena surface too.
- Check browser console warnings/errors during the room view.

**Step 3: Record the result**

- Mark the `Room Page Premium Rework` checklist complete in `tasks/todo.md`.
- Add a concise review section covering root cause, implemented layout changes, and verification evidence.
