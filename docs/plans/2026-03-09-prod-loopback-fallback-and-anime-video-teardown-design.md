# Prod Loopback Fallback And Anime Video Teardown Design

## Goal

Prevent production clients from ever falling back to loopback API/socket endpoints, and make AnimeThemes video playback release browser resources aggressively between rounds so later rounds do not stall before `media/prepared`.

## Problem

Two issues were observed in production:

1. The web client can still rotate to `127.0.0.1:3001` or `localhost:3001` after upstream failures, even when loaded from `https://kwizik.app`.
2. AnimeThemes rounds can stall after several rounds because the client downloads the next video but never reaches the local warm-up gate that triggers `POST /quiz/media/prepared`. The current code pauses videos, but does not reliably unload old sources and decoder state.

## Design

### 1. Loopback fallback policy

Loopback fallbacks stay available only for local browser development on loopback origins. Production and non-loopback origins must never add `127.0.0.1:3001` or `localhost:3001` to HTTP or WebSocket candidate lists.

This policy is applied in both:

- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/useRoomRealtimeSubscription.ts`

### 2. AnimeThemes media teardown

Introduce an explicit dispose path for AnimeThemes video elements on both `/play` and `/view`:

- `pause()`
- `removeAttribute("src")`
- `load()`

The dispose path runs when:

- the active AnimeThemes source disappears
- the round/track key changes
- the component unmounts

This ensures previous round videos do not keep buffering, decoding, or holding memory after they are no longer needed.

### 3. Warm-up diagnostics

Add targeted client logs around AnimeThemes warm-up lifecycle so production traces clearly show why `media/prepared` was not sent. The logs cover:

- warm-up blocked by insufficient buffer
- warm-up `play()` rejection
- warm-up verification timeout
- explicit media disposal
- soft reload attempts

Logs must be deduplicated per round/reason to avoid noisy consoles.

## Error Handling

- If warm-up remains blocked, the round must stay in loading. No auto-skip path is reintroduced.
- Diagnostics should explain the stall without changing game semantics.
- Disposal errors are swallowed after best-effort cleanup so teardown cannot crash gameplay.

## Testing

- Add web tests that assert loopback fallbacks are guarded behind local-dev checks.
- Add route-level tests that assert aggressive AnimeThemes unload behavior remains present in `/play` and `/view`.
- Re-run the existing targeted web and e2e suites that already cover the synchronized AnimeThemes flow.
