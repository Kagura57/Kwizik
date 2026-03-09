# Reveal Media Continuity Design

## Goal

Keep AnimeThemes and preview playback continuous when the room transitions from `playing` to `reveal` on both the player and projection screens.

## Problem

The current playback effects only treat `playing` as a valid media playback phase. When the server moves the room to `reveal`, both `play.tsx` and `view.tsx` immediately pause the active media element.

That creates two visible regressions:

- audio cuts out right when the answer reveal starts
- AnimeThemes video pauses instead of continuing into the reveal state

The current timeline sync logic has the same assumption. Once the phase is no longer `playing`, the playback target falls back to the base media offset instead of continuing to advance from the round start. Even if the media were resumed, the timeline target would no longer represent continuous playback through reveal.

## Constraints

- Keep the existing gameplay lock rules unchanged. Answer submission and skip behavior should still be gated by `playing` and `reveal` exactly as today.
- Preserve the single media element per round. Do not remount or reset the AnimeThemes source between guessing and reveal.
- Apply the same playback policy in `play.tsx` and `view.tsx`.
- Keep scope focused on media continuity. Do not refactor unrelated room flow code in this fix.

## Chosen Direction

### 1. Introduce an explicit playback continuity phase rule

Both routes should compute whether media playback must continue for the current effective phase. The continuity rule should cover:

- `playing`
- `reveal`

`leaderboard` remains out of scope for active playback in this fix because the current bug report is specifically about the reveal transition, and the product contract only requires continuity through reveal.

### 2. Keep the timeline target advancing during reveal

Playback target calculation should continue to use the round start timestamp while the continuity rule is active. That keeps `currentTime` aligned with the server-authoritative round timeline instead of snapping back to the base media offset on reveal.

### 3. Reuse the same rule for autoplay and pause decisions

The new continuity flag should drive:

- the video `pause()` / `play()` effects
- the audio preview `pause()` / `play()` effects
- the periodic timeline resync interval
- the user-interaction unlock path that retries autoplay

This avoids fixing one effect while leaving another effect to pause or stop syncing the same media element.

## Implementation Areas

### Player screen

- `apps/web/src/routes/room/$roomCode/play.tsx`
  - add a local playback continuity helper
  - keep timeline target moving through reveal
  - stop pausing video/audio on reveal
  - allow autoplay retry during reveal

### Projection screen

- `apps/web/src/routes/room/$roomCode/view.tsx`
  - mirror the same playback continuity behavior as the player screen

### Tests

- `apps/web/src/routes/room-play-anime.spec.tsx`
  - lock in the new reveal continuity markers in the player route source

## Testing Strategy

### Route-level regression coverage

- assert the player route source contains the reveal continuity helper and uses it for playback/timeline control

### Manual validation

- start an AnimeThemes round
- confirm the video remains hidden and audio continues during `playing`
- transition to `reveal`
- confirm audio does not cut and the same video element continues playing without pause or restart
- repeat the same check on `/room/:roomCode/view`
