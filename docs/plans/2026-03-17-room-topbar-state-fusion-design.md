# Room Topbar State Fusion Design

## Goal

Remove the oversized top chrome in the room experience by fusing the room state summary into the existing top navigation bar, for both the lobby and live gameplay states.

## Problem

The room currently stacks two separate top surfaces:

- the global `room-topbar` with logo and home action
- a second room-state header (`room-scene-header.lobby` or `live-status-bar`)

Even after previous compaction passes, this still creates too much vertical waste and leaves a large empty band above the actual gameplay content.

## Approved Direction

Use a single top chrome layer:

- keep the existing `room-topbar`
- inject the essential room-state pills directly into that bar
- remove the secondary top header surface from the room page

This applies to:

- lobby before start
- live gameplay
- reveal / leaderboard / results phases when relevant

## Layout

### Topbar structure

The topbar becomes a three-zone layout:

1. left: logo / brand
2. center: compact state pills
3. right: `Accueil`

### State pills

The pills keep only the essential live state:

- room
- manche
- joueurs prêts
- phase

They should read as utility metadata, not as cards or a hero header.

## Architecture

### Render strategy

The cleanest way to truly fuse the state into the shared topbar is:

- add a dedicated status slot element inside `apps/web/src/routes/__root.tsx`
- render the room-state pills from `apps/web/src/routes/room/$roomCode/play.tsx` via `createPortal`

This keeps ownership correct:

- topbar shell remains in the root layout
- room state still comes from the room page snapshot

### Removed surfaces

The room page no longer renders:

- `room-scene-header.lobby`
- `live-status-bar`

as visible top sections.

## Styling

### Topbar

- slightly reduce its vertical padding
- switch from a plain two-item row to a layout that can host compact wrapped pills
- preserve the existing brand and home affordance

### Pills

- smaller height
- lower contrast than the previous header cards
- no oversized background block behind the group
- wrap cleanly on smaller widths

## Mobile Behavior

On smaller screens:

- pills wrap under the brand/home row if needed
- the fused topbar remains compact
- the room content should start immediately below the bar with no extra header slab

## Verification

1. route tests still pass
2. web build still passes
3. visual result shows:
   - no second top banner
   - significantly less empty space above the gameplay area
   - no clipped topbar content on smaller widths
