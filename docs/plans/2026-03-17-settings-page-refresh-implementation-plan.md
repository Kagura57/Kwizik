# Settings Page Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the localized `/settings` page into a more polished, action-first control center without changing its underlying account and AniList logic.

**Architecture:** Keep all existing query and mutation flows in `settings.tsx`, but reorganize the route into a dedicated settings layout with a compact account summary header, a primary action column, and a secondary status rail. Add route-specific styling in `styles.css`, tighten the page copy in both locales, and cover critical states with a focused route test.

**Tech Stack:** React, TanStack Router, TanStack Query, TypeScript, global CSS, Vitest

---

### Task 1: Add a focused settings page test harness

**Files:**
- Create: `apps/web/src/routes/settings.spec.tsx`
- Reference: `apps/web/src/routes/layout.spec.tsx`
- Reference: `apps/web/src/router.tsx`

**Step 1: Write the failing test**

Create a route-level test that renders `SettingsPage` in at least two critical states:

- signed out
- signed in with AniList data

The test should assert:

- the localized title is rendered
- the AniList username block is present
- the title preference controls are present
- the sync overview and recovered library sections are present for signed-in users

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/routes/settings.spec.tsx`

Expected: FAIL because the new test file does not exist yet or because the page does not yet expose the intended landmarks/hooks cleanly enough for stable assertions.

**Step 3: Add the minimal render setup**

Implement a local test harness using the existing route/component testing patterns in the web app. Mock the API layer or query results as needed so the test can render deterministic signed-out and signed-in states without hitting real network flows.

**Step 4: Run test to verify baseline passes**

Run: `bun test apps/web/src/routes/settings.spec.tsx`

Expected: PASS once the harness is valid, even before the redesign is complete.

**Step 5: Commit**

```bash
git add apps/web/src/routes/settings.spec.tsx
git commit -m "test(web): cover settings page states"
```

### Task 2: Refactor the settings route structure and copy

**Files:**
- Modify: `apps/web/src/routes/settings.tsx`
- Reference: `apps/web/src/lib/api.ts`

**Step 1: Write the failing test expectation for the new structure**

Extend the settings route test so it expects stable section headings or testable landmarks for:

- account summary
- AniList connection
- title preference
- sync overview
- recovered library

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/routes/settings.spec.tsx`

Expected: FAIL because the current route is still a flat stack and does not expose the new structure.

**Step 3: Implement the route refactor**

In `apps/web/src/routes/settings.tsx`:

- keep all existing queries, effects, and mutations unless a simplification is clearly safe
- replace the flat `single-panel` rendering with a dedicated settings layout
- add a compact summary header for account identity + high-level AniList state
- separate the page into a main action column and a secondary status rail
- reorder blocks so the AniList action is primary
- convert the title preference block into a compact choice group
- tighten the copy in both English and French using action-oriented labels and shorter helper text
- preserve all existing loading/error/success behaviors

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/routes/settings.spec.tsx`

Expected: PASS with the new structure rendered.

**Step 5: Commit**

```bash
git add apps/web/src/routes/settings.tsx apps/web/src/routes/settings.spec.tsx
git commit -m "feat(web): refresh settings page structure"
```

### Task 3: Add settings-specific visual styling

**Files:**
- Modify: `apps/web/src/styles.css`
- Reference: `apps/web/src/routes/settings.tsx`

**Step 1: Write the failing visual/structure expectation**

If helpful, add one or two class-based assertions in the route test for the new layout hooks, such as:

- summary header container
- main grid container
- segmented preference control

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/routes/settings.spec.tsx`

Expected: FAIL because the new class hooks or structural containers are not yet fully styled/attached.

**Step 3: Implement minimal settings-specific CSS**

In `apps/web/src/styles.css`:

- add a dedicated settings page block rather than overloading the generic `single-panel` styles
- style the summary header with a more deliberate background/surface treatment
- define a two-column desktop layout and one-column mobile fallback
- give the main action column more visual weight than the secondary rail
- refine card spacing, borders, and typography hierarchy
- style the title preference as a compact segmented control
- improve recovered library row layout and status pill legibility
- ensure the layout remains consistent with the rest of the app visual language

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/routes/settings.spec.tsx`

Expected: PASS with the stable structure/hooks still intact.

**Step 5: Commit**

```bash
git add apps/web/src/styles.css apps/web/src/routes/settings.tsx apps/web/src/routes/settings.spec.tsx
git commit -m "style(web): add action-first settings layout"
```

### Task 4: Verify existing route behavior and responsive safety

**Files:**
- Modify if needed: `apps/web/src/routes/settings.tsx`
- Modify if needed: `apps/web/src/styles.css`

**Step 1: Run targeted route tests**

Run: `bun test apps/web/src/routes/settings.spec.tsx apps/web/src/routes/layout.spec.tsx apps/web/src/i18n/locale.spec.ts`

Expected: PASS

**Step 2: Run broader route coverage**

Run: `bun test apps/web/src/routes`

Expected: PASS or only pre-existing unrelated failures.

**Step 3: Run production build**

Run: `cd apps/web && bun run build`

Expected: PASS

**Step 4: Verify responsive rendering manually**

Check the localized settings page in desktop and mobile widths and confirm:

- header stays compact
- primary AniList action remains above the fold
- secondary rail stacks cleanly on mobile
- recovered library remains readable

Suggested command if browser verification is needed:

```bash
npx playwright test apps/web/e2e --grep "settings"
```

If there is no existing settings-specific Playwright coverage, do a manual local browser verification instead.

**Step 5: Commit**

```bash
git add apps/web/src/routes/settings.tsx apps/web/src/styles.css apps/web/src/routes/settings.spec.tsx
git commit -m "test(web): verify refreshed settings page"
```

### Task 5: Document completion in task tracking

**Files:**
- Modify: `tasks/todo.md`

**Step 1: Mark the settings refresh tasks complete**

Update the tracking section with completed checkboxes and a review summary.

**Step 2: Run a quick diff review**

Run: `git diff -- apps/web/src/routes/settings.tsx apps/web/src/styles.css apps/web/src/routes/settings.spec.tsx tasks/todo.md`

Expected: a scoped settings-page refresh with no unrelated regressions.

**Step 3: Commit**

```bash
git add tasks/todo.md
git commit -m "docs(tasks): record settings refresh review"
```

Plan complete and saved to `docs/plans/2026-03-17-settings-page-refresh-implementation-plan.md`.

Two execution options from the skill are normally:

1. Subagent-driven execution
2. Separate execution session

For this workspace, I will continue locally in the current session unless you want me to stop after the plan.
