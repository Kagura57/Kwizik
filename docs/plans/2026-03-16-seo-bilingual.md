# SEO Bilingual Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the web app into a French/English localized SPA with language-specific URLs, route-level SEO metadata, a neutral root entry page, and indexable public acquisition pages optimized for anime blind test searches.

**Architecture:** Keep the current Vite + TanStack Router SPA, but move application routes under a locale parent route, add a lightweight in-repo i18n layer, and centralize SEO metadata generation through TanStack Router-managed head tags. Public localized pages get acquisition-oriented content and structured data, while utility and dynamic routes stay translated but noindexed.

**Tech Stack:** TypeScript, React 19, TanStack Router, TanStack Query, Vite, Vitest

---

### Task 1: Establish the i18n and SEO test contract

**Files:**
- Create: `apps/web/src/i18n/locale.spec.ts`
- Modify: `apps/web/src/routes/layout.spec.tsx`
- Modify: `apps/web/src/routes/routes.spec.tsx`
- Reference: `apps/web/src/router.tsx`

**Step 1: Write the failing locale utility tests**

Cover:
- only `fr` and `en` are accepted locales
- unsupported locale input falls back safely
- localized path helpers build `/fr/...` and `/en/...`
- alternate URL helpers return `fr`, `en`, and `x-default`

```ts
describe("locale helpers", () => {
  it("accepts only supported locales", () => {
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
  });

  it("builds localized paths", () => {
    expect(localizedPath("fr", "/join")).toBe("/fr/join");
    expect(localizedPath("en", "/auth")).toBe("/en/auth");
  });
});
```

**Step 2: Extend the route tests with the failing localized expectations**

Add route assertions for:
- root route `/`
- localized home route `/$locale/`
- localized `join`, `auth`, `settings`
- localized room play/view routes

```ts
expect(routeIds.join("|")).toContain("/$locale");
expect(routeIds.join("|")).toContain("/$locale/join");
expect(routeIds.join("|")).toContain("/$locale/room/$roomCode/play");
```

**Step 3: Run the targeted tests to confirm failure**

Run:

```bash
bun test apps/web/src/i18n/locale.spec.ts apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: FAIL because the locale helpers and localized route tree do not exist yet.

**Step 4: Commit**

```bash
git add apps/web/src/i18n/locale.spec.ts apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx
git commit -m "test: define bilingual routing and locale helpers"
```

---

### Task 2: Add the locale core and metadata helpers

**Files:**
- Create: `apps/web/src/i18n/locale.ts`
- Create: `apps/web/src/i18n/dictionaries.ts`
- Create: `apps/web/src/i18n/seo.ts`
- Modify: `apps/web/src/lib/runtimeOrigin.ts`
- Modify: `apps/web/src/lib/runtimeOrigin.spec.ts`

**Step 1: Write the failing runtime-origin and SEO helper tests**

Add tests for:
- deriving the site origin for canonical URLs
- generating canonical and alternate URLs for a localized route
- resolving localized SEO metadata for public and noindex routes

```ts
it("builds canonical and alternates for localized routes", () => {
  const tags = buildSeoLinks({
    origin: "https://kwizik.app",
    locale: "en",
    routePath: "/join",
  });
  expect(tags.canonical).toBe("https://kwizik.app/en/join");
  expect(tags.alternates.fr).toBe("https://kwizik.app/fr/join");
});
```

**Step 2: Run the focused tests to confirm failure**

Run:

```bash
bun test apps/web/src/lib/runtimeOrigin.spec.ts apps/web/src/i18n/locale.spec.ts
```

Expected: FAIL because the locale and SEO helpers are not implemented.

**Step 3: Implement the minimal locale and SEO core**

Add:
- `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, and locale type guards
- dictionary shape for `fr` and `en`
- helpers to build localized route paths
- helpers to build canonical and `hreflang` URLs from a route path
- helpers to resolve route robots policy and common SEO fields

Keep the first pass small and typed. Avoid introducing a heavy external i18n package.

**Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test apps/web/src/lib/runtimeOrigin.spec.ts apps/web/src/i18n/locale.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/i18n/locale.ts apps/web/src/i18n/dictionaries.ts apps/web/src/i18n/seo.ts apps/web/src/lib/runtimeOrigin.ts apps/web/src/lib/runtimeOrigin.spec.ts
git commit -m "feat: add locale and SEO metadata helpers"
```

---

### Task 3: Restructure the router around localized URLs

**Files:**
- Modify: `apps/web/src/router.tsx`
- Create: `apps/web/src/routes/root-language.tsx`
- Create: `apps/web/src/routes/localized-layout.tsx`
- Modify: `apps/web/src/routes/layout.spec.tsx`
- Modify: `apps/web/src/routes/routes.spec.tsx`

**Step 1: Extend the route tests with failing behavior expectations**

Add expectations for:
- `/` rendering the neutral entry route
- `/$locale` as the app parent route
- unsupported locale handling

If needed, add a route-level helper test for `assertLocaleOrRedirect()`.

**Step 2: Run the route tests to confirm failure**

Run:

```bash
bun test apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: FAIL because the router still uses non-localized top-level routes.

**Step 3: Implement the localized route tree**

Move the existing page components under a locale route:
- root neutral page at `/`
- localized layout under `/$locale`
- localized children for home, join, auth, settings, and room pages

Implementation notes:
- validate the locale before rendering children
- keep route params for room pages intact
- preserve existing navigation intent while converting links to localized paths

**Step 4: Run the route tests to verify pass**

Run:

```bash
bun test apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/router.tsx apps/web/src/routes/root-language.tsx apps/web/src/routes/localized-layout.tsx apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx
git commit -m "feat: localize application routes"
```

---

### Task 4: Wire translated shell copy and route-aware language switching

**Files:**
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/join.tsx`
- Modify: `apps/web/src/routes/auth.tsx`
- Modify: `apps/web/src/routes/settings.tsx`
- Create: `apps/web/src/i18n/useLocale.ts`
- Create: `apps/web/src/i18n/useTranslations.ts`

**Step 1: Add failing component tests for localized shell behavior**

Cover:
- localized top bar copy changes between `fr` and `en`
- language switcher is present outside room routes
- switcher preserves same page when toggling locale

```tsx
it("renders english shell copy on /en", () => {
  // render root layout in english route context
  expect(screen.getByText("Live Anime Blind Test")).toBeInTheDocument();
});
```

**Step 2: Run the focused route/component tests to confirm failure**

Run:

```bash
bun test apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: FAIL because translations and localized navigation are not wired.

**Step 3: Implement the locale context and translated shell**

Add:
- a locale hook sourced from router params
- translation lookup hook
- translated shell copy, nav labels, and room/topbar labels
- language switcher that maps current route to the other locale equivalent

Keep query/mutation logic unchanged while replacing hard-coded user-visible strings with dictionary lookups where they are static.

**Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/routes/__root.tsx apps/web/src/routes/index.tsx apps/web/src/routes/join.tsx apps/web/src/routes/auth.tsx apps/web/src/routes/settings.tsx apps/web/src/i18n/useLocale.ts apps/web/src/i18n/useTranslations.ts
git commit -m "feat: translate shell and primary pages"
```

---

### Task 5: Render localized SEO head tags and structured data

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/seo.spec.tsx`
- Modify: `apps/web/src/i18n/seo.ts`

**Step 1: Write the failing SEO rendering tests**

Cover:
- localized home page sets the expected document title
- localized home page emits canonical and `hreflang`
- auth/settings are marked `noindex`
- room pages are marked `noindex,nofollow`
- home page emits JSON-LD script tags

```tsx
it("marks auth as noindex", async () => {
  renderAppAt("/en/auth");
  expect(document.head.innerHTML).toContain('name="robots"');
  expect(document.head.innerHTML).toContain("noindex,follow");
});
```

**Step 2: Run the focused SEO tests to confirm failure**

Run:

```bash
bun test apps/web/src/routes/seo.spec.tsx
```

Expected: FAIL because route-managed head tags are not yet rendered and metadata is not defined.

**Step 3: Implement head rendering and per-route metadata**

Add:
- `HeadContent` rendering in the app root
- route-level `meta` and `links` definitions for localized pages
- JSON-LD on localized home pages
- conservative robots directives for utility and dynamic pages

Also enrich `apps/web/index.html` with stable defaults:
- baseline `lang`
- favicon/manifest/theme-color defaults
- placeholder description only if route metadata will override it reliably

**Step 4: Run the focused SEO tests to verify pass**

Run:

```bash
bun test apps/web/src/routes/seo.spec.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/index.html apps/web/src/main.tsx apps/web/src/routes/__root.tsx apps/web/src/routes/seo.spec.tsx apps/web/src/i18n/seo.ts
git commit -m "feat: add localized route SEO metadata"
```

---

### Task 6: Rework the public acquisition pages for anime blind test SEO

**Files:**
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/i18n/dictionaries.ts`
- Modify: `apps/web/src/routes/seo.spec.tsx`

**Step 1: Extend the failing home-page SEO tests**

Add assertions for:
- localized `h1`
- FAQ copy presence
- product sections describing anime blind test gameplay
- translated structured data content

```tsx
expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Blind Test Anime en ligne");
expect(screen.getByText(/openings/i)).toBeInTheDocument();
```

**Step 2: Run the focused tests to confirm failure**

Run:

```bash
bun test apps/web/src/routes/seo.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: FAIL because the current home page is utility-first and lacks the planned acquisition content.

**Step 3: Implement the localized acquisition content**

Add to the home page, below the core create/join flow:
- localized hero heading aligned with search intent
- multiplayer value proposition
- “how it works” section
- anime-focused FAQ
- stronger semantic headings and accessible landmarks

Preserve the current create/join room UX and avoid turning the page into a generic marketing template.

**Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test apps/web/src/routes/seo.spec.tsx apps/web/src/routes/routes.spec.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/routes/index.tsx apps/web/src/styles.css apps/web/src/i18n/dictionaries.ts apps/web/src/routes/seo.spec.tsx
git commit -m "feat: optimize localized home pages for anime blind test SEO"
```

---

### Task 7: Add neutral root entry page and language preference handling

**Files:**
- Modify: `apps/web/src/routes/root-language.tsx`
- Create: `apps/web/src/lib/localeMemory.ts`
- Create: `apps/web/src/lib/localeMemory.spec.ts`
- Modify: `apps/web/src/i18n/useLocale.ts`

**Step 1: Write the failing root-entry tests**

Cover:
- `/` renders links to `/fr/` and `/en/`
- language selection is explicit and crawlable
- remembered locale is stored after explicit user choice

```ts
expect(screen.getByRole("link", { name: /francais/i })).toHaveAttribute("href", "/fr/");
expect(screen.getByRole("link", { name: /english/i })).toHaveAttribute("href", "/en/");
```

**Step 2: Run the focused tests to confirm failure**

Run:

```bash
bun test apps/web/src/lib/localeMemory.spec.ts apps/web/src/routes/routes.spec.tsx
```

Expected: FAIL because the neutral entry page and locale memory do not exist.

**Step 3: Implement the neutral entry page**

Add:
- neutral root content with localized entry links
- optional locale memory persisted after explicit choice
- fallback behavior that never hides localized URLs from crawlers

Do not auto-redirect crawlers or first-time users from `/` purely on browser language.

**Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test apps/web/src/lib/localeMemory.spec.ts apps/web/src/routes/routes.spec.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/routes/root-language.tsx apps/web/src/lib/localeMemory.ts apps/web/src/lib/localeMemory.spec.ts apps/web/src/i18n/useLocale.ts
git commit -m "feat: add neutral language entry page"
```

---

### Task 8: Add crawl assets and final verification

**Files:**
- Create: `apps/web/public/robots.txt`
- Create: `apps/web/public/sitemap.xml`
- Create: `apps/web/public/site.webmanifest`
- Optionally modify: `apps/web/public/favicon.svg`
- Optionally create: `apps/web/public/og-image.png`

**Step 1: Add failing verification assertions where practical**

If there is an asset test harness already, use it. Otherwise verify through build output inspection in the next step.

**Step 2: Create the crawl assets**

Add:
- `robots.txt` pointing to the sitemap
- `sitemap.xml` with `/`, `/fr/`, `/en/`, and any intentionally indexable localized public pages
- localized-aware web manifest defaults
- social image reference if available

Keep dynamic room URLs out of the sitemap.

**Step 3: Run final verification**

Run:

```bash
bun test apps/web/src/lib/runtimeOrigin.spec.ts apps/web/src/lib/localeMemory.spec.ts apps/web/src/routes/layout.spec.tsx apps/web/src/routes/routes.spec.tsx apps/web/src/routes/seo.spec.tsx
bun run --cwd apps/web build
```

Expected:
- all targeted tests PASS
- production build PASS

Then inspect the built output:

```bash
rg -n "robots|sitemap|manifest|application/ld\\+json|hreflang|canonical" apps/web/dist -S
```

Expected: build artifacts and metadata references are present.

**Step 4: Commit**

```bash
git add apps/web/public/robots.txt apps/web/public/sitemap.xml apps/web/public/site.webmanifest apps/web/public/og-image.png
git add apps/web/src apps/web/index.html
git commit -m "feat: ship bilingual SEO foundations"
```

---

Plan complete and saved to `docs/plans/2026-03-16-seo-bilingual.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
