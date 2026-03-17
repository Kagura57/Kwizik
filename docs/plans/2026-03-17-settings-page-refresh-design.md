# Settings Page Refresh Design

**Date:** 2026-03-17

**Goal:** Refresh the `/settings` page so it feels more intentional visually and more action-oriented functionally, while keeping the existing account and AniList behavior unchanged.

**Chosen Direction:** Hybrid layout with a stronger top section and a control-center body. The page should feel more polished than a generic form stack, but still behave like a fast utility screen rather than a marketing surface.

## Context

The current [`apps/web/src/routes/settings.tsx`](../../apps/web/src/routes/settings.tsx) is functionally complete:

- signed-in state handling is already correct
- AniList username updates and sync queueing already work
- title preference updates already work
- sign-out flow already works
- sync status and recovered library data are already available

The main weaknesses are presentation and action hierarchy:

- the page is a flat stack of similar cards inside `single-panel`
- the most important action competes with informational blocks
- account context, AniList configuration, sync status, and recovered library are not clearly separated by purpose
- helper copy is correct but longer and more procedural than it needs to be
- desktop and mobile both read as a generic admin/settings page rather than a polished product control surface

## User Priorities

The redesign was validated against these priorities:

- visual direction: `hybrid`
- primary outcome: `actions`

That means the page should optimize first for:

1. understanding the primary action quickly
2. completing that action with minimal friction
3. checking status only when needed

## Design Principles

- **Actions first:** The AniList configuration action is the main interaction and should dominate the page body.
- **Fast status read:** Users should know whether their setup is ready in a few seconds.
- **Useful hierarchy:** Separate “act” from “monitor”.
- **Shorter copy:** Use concise labels, status lines, and CTAs informed by `ux-writing`, `ux-copy`, and `microcopy`.
- **No backend scope creep:** Keep the existing APIs and data model intact.

## Proposed Information Architecture

### 1. Compact header

The top of the page becomes a distinct summary band with:

- page title and one-line description
- signed-in user identity
- concise AniList readiness summary
- last successful sync timestamp

This section should look more premium than the rest of the page, but stay compact enough that it does not push the actionable content too far below the fold.

### 2. Main action column

The main column contains the controls users are most likely to use:

#### AniList connection

- primary settings block
- input for AniList username
- short helper line
- one clear primary CTA with contextual label

Expected CTA states:

- connect / configure when no username is set
- update when a username already exists
- saving/updating while pending

Behavior remains the same:

- save username
- if username is non-empty, queue a sync

#### Title preference

- presented as a compact segmented-choice control
- same options as today: mixed / romaji / english
- active option must be visually obvious
- no API or behavior change

#### Session actions

- sign out remains available but visually separated from AniList actions
- back-home action remains secondary

### 3. Secondary status rail

The right-hand rail on desktop groups monitoring surfaces:

#### Sync overview

- sync status badge
- progress
- last run time
- last successful sync time if relevant

When an error exists, the card should surface a concise explanation and make the issue feel localizable, not mysterious.

#### Recovered library

- recovered count as a summary metric
- list remains scrollable
- list rows become visually cleaner and easier to scan
- empty state becomes clearer and less abrupt

On mobile, this rail stacks below the main action column.

## Visual Direction

- Keep alignment with the established app look instead of introducing a separate design system.
- Use a more distinct top surface for the header: stronger background treatment, cleaner spacing, more deliberate typography.
- Give the action column slightly more weight than the status rail.
- Improve surface contrast and card differentiation without making the page noisy.
- Use clearer badges and summary numbers for quick scanning.

This should feel like a refined product settings screen, not a dashboard overload and not a landing page.

## Copy Direction

Copy should follow these rules:

- shorter helper text
- stronger verbs in CTAs
- clearer state labels
- fewer “do X then click Y” constructions

Examples of target direction:

- “AniList username” helper becomes shorter and more direct
- sync statuses read as quick state labels instead of internal process wording
- empty states explain what the user should do next without technical framing

The page remains fully bilingual (`fr` / `en`), so wording should stay compact and localization-safe.

## Functional Scope

### In scope

- route layout refresh
- improved visual hierarchy
- compact summary header
- action-first desktop and mobile composition
- copy cleanup for labels, helper text, empty states, and status labels
- clearer CTA labeling
- better visual treatment of sync and recovered library blocks

### Out of scope

- backend changes
- new sync capabilities
- new account preferences
- new AniList data fields
- changes to unrelated routes or global shell layout

## Responsive Behavior

- desktop/tablet: two-column control-center layout
- mobile: single column with action blocks first and monitoring blocks after
- no nested panes that feel cramped on small screens
- the recovered library list keeps a bounded height but remains usable

## Validation Plan

Implementation must verify:

- signed-out state still renders correctly
- signed-in state still supports username update + sync start
- title preference still updates correctly
- sign-out still works
- sync status still refreshes during running/queued states
- recovered library loading, empty, error, and populated states remain correct
- route remains visually coherent on desktop and mobile

## Files Expected To Change

- `apps/web/src/routes/settings.tsx`
- `apps/web/src/styles.css`
- likely a new targeted route test for settings rendering and/or interactions

## Decision Summary

The selected solution is a **hybrid control-center refresh**:

- stronger summary header
- action-first main column
- status-focused secondary rail
- cleaner microcopy
- no backend or product-scope expansion
