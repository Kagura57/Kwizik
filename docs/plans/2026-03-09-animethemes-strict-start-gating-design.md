# AnimeThemes Strict Start Gating Design

## Goal

Ensure AnimeThemes rounds never auto-skip and never enter `playing` until the media has actually started locally for every active player required to participate in the round.

## Problem

The current synchronization flow still has three behaviors that break blindtest fairness:

- the client reports `media/prepared` too early, based on a light buffering threshold rather than real playback start
- the server schedules round start on quorum, not on all active players
- both client and server still keep automatic AnimeThemes skip paths for long stalls

This allows a room to enter `playing` while one or more players still have no real audio/video playback, which invalidates the synchronized blindtest contract.

## Product Rules

- AnimeThemes rounds must never auto-skip.
- A round must not start for only part of the room.
- The round may stay in `loading` as long as necessary until all active players are genuinely ready to start together.
- Manual user-driven skip remains outside the scope of this fix.

## Chosen Direction

### 1. Replace optimistic readiness with verified local start

The player page should no longer send `media/prepared` as soon as the browser can buffer or seek.

Instead, while the room is in `loading`, the AnimeThemes `<video>` should:

- stay hidden
- be temporarily played in a muted warm-up mode
- be considered ready only after a real local playback start is observed and the current time has advanced enough to prove decoding actually started

After that verification succeeds, the client pauses the element, rewinds it to the canonical round offset, and sends the existing `media/prepared` acknowledgement.

This keeps the current API shape while upgrading the meaning of the signal from "probably loadable" to "verified startable".

### 2. Require all active players before scheduling the shared start

The round sync coordinator should no longer use majority quorum or timeout fallback for AnimeThemes round start.

The server should only schedule `plannedStartAtMs` once every active player for the room has acknowledged verified local start for the current round.

This turns `loading` into a true synchronization barrier instead of a best-effort approximation.

### 3. Remove automatic AnimeThemes skip behavior

Long AnimeThemes stalls should no longer:

- auto-advance the room on the server
- remove the active media and auto-report unavailability on the client

The system can still surface long-loading feedback and keep retrying local media load attempts, but it must never move the room forward on its own.

## Implementation Areas

### Web

- `apps/web/src/routes/room/$roomCode/play.tsx`
  - replace buffer-only readiness with verified hidden playback start
  - keep loading playback muted during warm-up
  - remove automatic unavailable escalation / auto-skip path

- `apps/web/src/routes/room/$roomCode/view.tsx`
  - keep projection behavior compatible with the stricter start contract
  - optionally mirror hidden warm-up so projection is ready when the shared start happens

### API

- `apps/api/src/services/RoundSyncCoordinator.ts`
  - require all active players before scheduling the round
  - remove timeout-based scheduling

- `apps/api/src/services/RoomStore.ts`
  - remove AnimeThemes loading-time auto-skip
  - make `reportMediaUnavailable()` non-advancing for AnimeThemes

## Testing Strategy

### API tests

- round start is scheduled only after all active players report readiness
- loading remains stuck without full room readiness
- AnimeThemes unavailable reports no longer advance or finish the room

### Web tests

- player route source contains explicit loading-time playback verification logic
- player route no longer contains the auto-skip toast text
- projection route still follows the reveal-continuity contract

### Manual validation

- run a room with slow AnimeThemes media
- confirm the room stays in `loading` until the local media truly starts
- confirm no automatic round skip occurs
- confirm all players hear the track start at the same scheduled moment once everyone is ready
