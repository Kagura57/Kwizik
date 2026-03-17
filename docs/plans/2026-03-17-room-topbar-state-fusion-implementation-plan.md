# Room Topbar State Fusion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fuse the room state summary into the existing room topbar and remove the separate top header surface in lobby and live gameplay.

**Architecture:** Add a shared status slot to the room topbar in the root layout, then render compact room-state pills from the room play page through a portal. Remove the old lobby/live top header blocks and tighten the topbar styling so gameplay starts higher on the page.

**Tech Stack:** React, TypeScript, React DOM portal, TanStack Router, existing room snapshot state, CSS in `apps/web/src/styles.css`

---

### Task 1: Add the room-topbar status slot

**Files:**
- Modify: `apps/web/src/routes/__root.tsx`

**Step 1: Add a dedicated status slot element inside the room topbar**

Place it between the logo and the home action.

**Step 2: Give it a stable id/class for portal mounting**

Use a single room-only slot that the room play page can target.

### Task 2: Render compact room state inside the topbar

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`

**Step 1: Import `createPortal`**

Use a portal instead of duplicating topbar structure in the room page.

**Step 2: Resolve the topbar slot after mount**

Store the target element in local state.

**Step 3: Render the compact room-state pills into that slot**

Include:

- room
- manche
- joueurs prêts
- phase

### Task 3: Remove the old secondary room header

**Files:**
- Modify: `apps/web/src/routes/room/$roomCode/play.tsx`

**Step 1: Delete the lobby `room-scene-header` block**

**Step 2: Delete the live `live-status-bar` block**

**Step 3: Keep the content flow starting immediately with the main room article**

### Task 4: Restyle the room topbar and compact status pills

**Files:**
- Modify: `apps/web/src/styles.css`

**Step 1: Update `.room-topbar` to support three zones and wrapping**

**Step 2: Add styling for the injected status slot and pills**

Keep them compact and utility-like.

**Step 3: Remove now-obsolete top-header spacing assumptions**

Make sure content begins closer to the top.

**Step 4: Add responsive behavior**

Allow clean wrapping on tablet/mobile without a second large row of chrome.

### Task 5: Verify

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Run route tests**

Run: `bun test apps/web/src/routes`
Expected: PASS

**Step 2: Run the web build**

Run: `cd apps/web && bun run build`
Expected: PASS

**Step 3: Document the review**

Record the result and any residual layout risk in `tasks/todo.md`.
