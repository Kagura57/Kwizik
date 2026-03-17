# App Copy Centralization Design

## Goal

Refactor the web app copy so all user-facing text is shorter, more consistent, and easier to maintain, while moving route-local copy into dedicated i18n modules for both `fr` and `en`.

## Current State

The app currently embeds most UI copy directly inside route files:

- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/index.tsx`
- `apps/web/src/routes/join.tsx`
- `apps/web/src/routes/auth.tsx`
- `apps/web/src/routes/settings.tsx`
- `apps/web/src/routes/room/$roomCode/play.tsx`
- `apps/web/src/routes/room/$roomCode/view.tsx`

This causes three problems:

1. Copy quality is uneven. Some strings are too long, awkward, repetitive, or inconsistent between routes.
2. Product terminology is unstable. Terms like `room`, `host`, `reveal`, `sync`, `playlist`, `ready`, and `mode` are phrased differently depending on the file.
3. Maintenance is expensive. Rewriting copy requires editing many unrelated route files instead of a dedicated content layer.

## Scope

This pass covers all visible web-app copy for both supported locales:

- navigation and shell copy
- home page editorial and CTA copy
- join/auth/settings forms and status text
- room lobby/live/reveal/results UI copy
- projection view copy
- toast/error/success messages that are authored in the web app

This pass does not change:

- backend API behavior
- route structure
- gameplay logic
- SEO architecture beyond wording updates

## Copy Direction

### Product voice

The target voice is:

- clear first
- short by default
- action-oriented
- calm rather than promotional
- consistent across screens

### Terminology decisions

To reduce friction, the rewrite keeps product-native terms already familiar to players:

- keep `room` in both locales
- keep `AniList`, `playlist`, `OP`, `ED`, `QCM`
- keep `host` in FR for now rather than introducing mixed `host` / `hôte`

The rewrite should remove awkward phrasing around those terms rather than replacing the vocabulary wholesale.

### Writing rules

- Prefer one short sentence over a long descriptive block.
- Every error should say what happened and what the user can do next when useful.
- CTA labels should use the clearest action, not decorative wording.
- Helper text should support the immediate action, not restate the page theme.
- Repeated phrases should be normalized across routes.

## Architecture

### New copy layer

Create a dedicated copy layer under `apps/web/src/i18n/copy/` with one module per major surface:

- `root.ts`
- `home.ts`
- `join.ts`
- `auth.ts`
- `settings.ts`
- `room.ts`
- `projection.ts`
- `index.ts` or `types.ts` for shared locale helpers

Each module should expose:

- a typed copy object for `fr` and `en`
- a small getter like `getHomeCopy(locale)`
- any route-specific formatter or error-message helpers currently embedded in the route

### Route integration

Each route should import its copy getter and message helpers from the new copy module instead of defining inline locale objects.

The room route is the largest case and should move:

- static lobby/live/reveal copy
- status labels
- helper label formatters
- frontend-authored error messages

into `apps/web/src/i18n/copy/room.ts`.

## Data Flow

1. Route gets locale from `useCurrentLocale()` or `useOptionalLocale()`.
2. Route resolves copy through the dedicated module.
3. Route renders that copy and uses centralized helper functions for labels/toasts.

No runtime behavior changes beyond wording.

## Error Handling

Centralized helper functions should preserve existing backend error-code branching where it matters. The change is only to:

- simplify wording
- align terminology
- make next actions clearer

## Testing Strategy

Verification should prove both safety and maintainability:

1. Run route tests that cover the touched pages.
2. Run the web build to catch type or import regressions.
3. Review the diff for wording consistency across `fr` and `en`.

## Risks

### Main risk

The room route contains many small locale-dependent helpers. A sloppy extraction could break imports or subtly change the intended meaning of runtime status text.

### Mitigation

- move helpers in coherent groups
- keep function names explicit
- preserve call sites first, then tighten wording
- verify with route tests and build

## Expected Outcome

After this pass:

- copy is easier to review in one place
- routes become less noisy
- both locales read more naturally
- future text edits stop requiring a hunt through large route components
