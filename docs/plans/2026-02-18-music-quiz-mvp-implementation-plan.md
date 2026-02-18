# Music Quiz Multiplayer MVP Implementation Plan

- Date: 2026-02-18
- Based on: `docs/plans/2026-02-18-music-quiz-mvp-design.md`
- Goal: Deliver a fluid party-first MVP with mandatory streak and user-oriented E2E gates

## Milestones

1. M1: Core game loop stable in local multiplayer conditions
2. M2: Multi-provider pool preload with resilient fallback
3. M3: Auth + history (intermediate scope) and release-grade quality gates

## Sprint Plan

### Sprint 1: Game Engine And Room Flow

#### Must
- Implement `RoomManager` state machine:
  - `waiting -> countdown -> playing -> reveal -> results`
- Implement server-authoritative timer/deadline handling.
- Implement single-submit lock per player per round.
- Implement `ScoreCalculator` with mandatory streak:
  - multiplier progression
  - reset on wrong/timeout
  - deterministic tie-breakers
- Deliver API routes for create/join/start/submit/results.
- Build frontend core routes:
  - `/`
  - `/join`
  - `/lobby/$roomCode`
  - `/play/$roomCode`
  - `/results/$roomCode`
- Wire realtime room synchronization for core events.

#### Should
- Implement reconnect/resync using room snapshot endpoint.
- Add visible room/game error states and retry/rejoin actions.

#### Exit criteria
- 3+ players can complete a full 8-round game with synchronized flow.
- Scoring and streak outputs are consistent and reproducible.

### Sprint 2: Music Pool Pipeline And Mixed Answer Modes

#### Must
- Implement `MusicAggregator.buildTrackPool(category, size)` with provider fallback chain.
- Implement provider timeouts and temporary circuit breaker.
- Implement `TrackCache` for category/difficulty short-term reuse.
- Ensure rounds consume preloaded pool only (no blocking live fetch in round path).
- Implement mixed round type config:
  - text rounds + `FuzzyMatcher`
  - multiple choice rounds
- Add controlled degradation policy when pool size is insufficient.

#### Should
- Normalize metadata confidence/source for observability.
- Add server logs for provider fallback and pool health.

#### Exit criteria
- Game starts with preloaded pool reliably.
- Provider failures do not block active gameplay.

### Sprint 3: Auth, History, Hardening, E2E Gates

#### Must
- Add basic auth integration for persistent history.
- Persist final rankings and basic player stats:
  - matches played
  - top1 count
  - best streak
- Add unit tests for:
  - `ScoreCalculator`
  - `FuzzyMatcher`
  - state transitions
  - deadline/locking edge cases
- Add API integration tests for full route sequence and fallback scenarios.
- Add user-directed E2E core pack (mobile-first):
  - create room
  - join with 3+ players
  - play full game
  - podium + streak validation
  - reconnect in active round
- Enforce CI gate: unit + integration + core E2E required on main.

#### Should
- Add smoke “party-night” scenario to run pre-release.

#### Exit criteria
- Core E2E green in CI.
- No blocking regressions in core party flow.

## Backlog By Priority

### P0
- Room state machine and deadline authority
- Mandatory streak scoring
- Preloaded pool fallback pipeline
- Core realtime flow and resync
- Core user journey E2E

### P1
- Auth + persistent history
- Advanced fuzzy matching tuning
- Better degraded category selection

### P2
- Extra social/profile features
- Monetization foundation
- Advanced analytics dashboards

## Test Matrix

### Unit
- Correctness, streak, tie-breakers
- Fuzzy normalization and tolerance
- Transition validity and lock rules

### Integration
- Happy path room lifecycle
- Provider timeout/error fallback
- Rejoin/resync consistency

### E2E
- Multi-player full session
- Mid-round reconnect
- Host actions (start/skip)
- UX assertions: timer sync, score/streak visibility, no dead-end screens

## Execution Order (Implementation)

1. Backend engine and scoring first
2. Frontend lobby/play/results skeleton with realtime events
3. Provider fallback pipeline and preload integration
4. Mixed answer mode and fuzzy pass
5. Auth/history persistence
6. Full test pyramid and CI enforcement

## Risks And Mitigations

- Provider instability
  - Mitigation: timeout + breaker + preload + cache
- Realtime drift
  - Mitigation: snapshot resync and server-authoritative deadlines
- Scoring trust issues
  - Mitigation: strict server scoring and lock semantics
- Release regressions
  - Mitigation: mandatory E2E gate on core user journey
