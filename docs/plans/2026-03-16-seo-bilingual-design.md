# Kwizik SEO Bilingual Design

**Date:** 2026-03-16
**Status:** Approved
**Scope:** Rework the web application into a French/English localized experience with search-friendly public pages, language-specific URLs, and route-level SEO metadata while keeping the existing Vite SPA architecture.

---

## 1. Product Direction

Kwizik should rank for high-intent searches around anime blind tests while also becoming usable in English.

Validated product decisions:
- The application becomes a real bilingual app, not just a translated landing page.
- SEO should focus on acquisition intent such as `blind test anime`, `anime blind test online`, and multiplayer anime quiz queries.
- The existing SPA architecture stays in place. No SSR or prerender migration is part of this project.
- Search-facing URLs must be language-specific.

Out of scope:
- Migrating the frontend to SSR, SSG, or another framework.
- Translating backend-only logs or internal diagnostics.
- Indexing dynamic room pages or account utility pages.

---

## 2. Final Decisions (Validated)

- Language model: full application bilingual support in French and English.
- URL strategy: explicit localized paths under `/fr/...` and `/en/...`.
- Root route `/`: neutral entry page with crawlable links to the localized homes, not an automatic locale redirect.
- Primary acquisition page: localized home pages `/fr/` and `/en/`.
- Indexation policy:
  - index: `/fr/`, `/en/`
  - optional index: `/fr/join`, `/en/join` only if they contain distinct useful content
  - noindex: `/fr/auth`, `/en/auth`, `/fr/settings`, `/en/settings`
  - noindex: all localized room routes
- SEO metadata must be managed per route, per locale.
- Every localized page should declare its own canonical URL plus `hreflang` alternates for `fr`, `en`, and `x-default`.

---

## 3. Architecture

### 3.1 Routing Model

Introduce a locale-aware parent route so the app does not duplicate the route tree:
- `/` renders a neutral language-selection page.
- `/$locale` becomes the parent of all application routes.
- Allowed locales are limited to `fr` and `en`.
- Existing pages move under that locale segment:
  - `/$locale/`
  - `/$locale/join`
  - `/$locale/auth`
  - `/$locale/settings`
  - `/$locale/room/$roomCode/play`
  - `/$locale/room/$roomCode/view`

This preserves the current SPA model while creating stable, crawlable URLs for each language.

### 3.2 Localization Layer

Add a dedicated `src/i18n/` layer with:
- locale definitions and helpers
- route-localized path builders
- translation dictionaries for `fr` and `en`
- helpers for SEO strings and structured data

The translation system should stay simple and repo-native:
- no heavy runtime dependency unless the codebase clearly benefits from it
- typed keys where practical
- French fallback in development if a translation key is missing
- explicit test coverage for the locale utilities

### 3.3 Document Head Management

Use TanStack Router route metadata for:
- `title`
- meta description
- robots directives
- canonical links
- `hreflang` alternate links
- Open Graph and Twitter tags
- JSON-LD structured data

The root document must render router-managed head tags so localized metadata appears in the actual DOM during client rendering.

---

## 4. Public SEO Strategy

### 4.1 Localized Home Pages

`/fr/` and `/en/` become the main acquisition pages. They should keep the current fast access to create/join room flows, while adding real search-facing content:
- explicit `h1` around anime blind test intent
- sections explaining how the product works
- multiplayer and room-based value proposition
- anime-focused vocabulary: openings, endings, quiz between friends, online party play
- concise FAQ with direct answers to common intent-driven questions

The tone should stay product-oriented, not blog-like.

### 4.2 Structured Data

Add localized structured data on the home pages:
- `WebSite`
- `SoftwareApplication`
- `FAQPage`

The structured data must reflect the localized URLs and translated visible copy.

### 4.3 Route-Level SEO Rules

Localized public pages:
- strong titles and descriptions
- self-referential canonical
- localized Open Graph copy
- `hreflang` alternates

Localized utility pages:
- translated titles for UX
- `noindex,follow`
- canonical to the same localized URL

Dynamic room pages:
- translated titles for UX only
- `noindex,nofollow`
- no acquisition-oriented structured data

---

## 5. UX and Language Switching

### 5.1 Neutral Entry Page

`/` becomes a lightweight language selector and `x-default` landing page:
- short product explanation
- explicit links to `/fr/` and `/en/`
- optional remembered language preference for user convenience
- no competing long-form SEO copy that would cannibalize localized homes

### 5.2 Language Switcher

Expose a visible language switcher in the app shell.

Behavior:
- when switching language, keep the equivalent route when one exists
- preserve dynamic params such as `roomCode`
- if an equivalent localized route is not available, fall back to the target locale home

The switcher is part of the product UX, not only a search feature.

---

## 6. Translation Scope

### 6.1 Included in This Project

- top-level shell copy
- public pages
- join/auth/settings pages
- room top bar and navigation
- important static labels, buttons, hints, and empty states
- route-level SEO strings and social metadata

### 6.2 Deferred or Lower Priority

- every gameplay toast and edge-case runtime message, if needed for first delivery sequencing
- backend-only strings
- non-user-facing developer diagnostics

The first implementation should still feel like a coherent bilingual app, not a partially translated landing page bolted onto a French product.

---

## 7. Implementation Principles

- Reuse the existing route and component structure whenever possible.
- Prefer a locale-aware layout over duplicating whole pages.
- Centralize SEO metadata generation so canonical/hreflang/robots decisions are not hand-written in multiple places.
- Keep `noindex` defaults conservative for low-value routes.
- Avoid machine-generated translation behavior at runtime. Ship versioned dictionaries.
- Preserve current gameplay behavior and networking flows.

---

## 8. Testing Strategy

### Unit / Route Tests

- locale parsing and validation
- localized path generation
- alternate URL generation
- route registration under `/fr` and `/en`
- fallback behavior for unsupported locales

### SEO Verification

- route metadata emits expected `title`, `description`, `robots`
- canonical and `hreflang` values point to the correct localized URLs
- neutral root page exposes the localized entry links
- noindex routes remain noindex in both languages

### Build / App Verification

- production build succeeds
- public assets include `robots.txt`, sitemap, manifest, and social image references
- manual DOM verification confirms head tags and JSON-LD are present after route navigation

---

## 9. Risks and Guardrails

Main risks:
- duplicating route trees and creating maintenance debt
- shipping inconsistent translations between visible copy and metadata
- accidentally indexing room or account pages
- making `/` compete with `/fr/` and `/en/`

Guardrails:
- single locale-aware routing architecture
- shared metadata helpers
- tests for `robots`, canonical, and alternates
- conservative indexing policy

---

## 10. Deliverable Summary

When complete, Kwizik will have:
- a bilingual French/English application shell and core pages
- localized URLs under `/fr` and `/en`
- localized SEO metadata and structured data
- a neutral root page for language entry
- explicit search indexation boundaries for public versus utility/dynamic pages
- a stronger acquisition surface for anime blind test queries without changing the SPA architecture
