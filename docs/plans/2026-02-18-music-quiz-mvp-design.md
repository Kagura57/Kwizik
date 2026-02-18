# Music Quiz Multiplayer MVP Design

- Date: 2026-02-18
- Project: Tunaris (mobile-first multiplayer music quiz)
- Status: Approved

## 1. Goals And Scope

### Primary goal
Deliver a highly fluid party-game experience for users playing together on phones in the same room.

### Confirmed scope
- Gameplay-first MVP
- Multi-provider audio with fallback
- Intermediate non-game scope:
  - Basic auth
  - Simple match history
  - No payment/Stripe in MVP
- Answer mode in MVP:
  - Mixed rounds (text and multiple choice)
- Streak mechanic:
  - Mandatory

### Out of scope for MVP
- Monetization
- Advanced profile/social layer
- Heavy personalization/recommendation engine

## 2. Recommended Architecture

### Runtime and app split
- Frontend: React mobile-first room session experience
- Backend: Elysia as authoritative game engine
- Realtime: Supabase Realtime for room synchronization

### Core architecture decision
Use a game-first model with a preloaded track pool per room:
- At game start, backend builds a track pool through ordered provider fallback
- During rounds, gameplay never waits on live provider requests
- Pool is consumed round by round for stable latency

### Reliability model
- Realtime first, with snapshot/polling resync fallback
- Backend is source of truth for timer, answers, scoring, and transitions

## 3. Components And Responsibilities

### Backend services
- `MusicAggregator`
  - `buildTrackPool(category, size)`
  - Provider fallback chain
  - Metadata normalization (`title`, `artist`, `previewUrl`, `source`, `confidence`)
- `TrackCache`
  - Short-term cache by category/difficulty to reduce provider calls
- `RoomManager`
  - State machine orchestration
  - Server-side locking and round progression
- `ScoreCalculator`
  - Speed + correctness + mandatory streak logic
- `FuzzyMatcher`
  - Text normalization and fuzzy matching
  - Strict validation path for multiple choice rounds

### Frontend modules
- `useGameRoom`: room/game state subscription and actions
- `QuizRound`: renders mixed mode rounds (text or multiple choice)
- `gameStore` (Zustand): local/transient UI state only

## 4. Game State And Data Flow

### State machine
`waiting -> countdown -> playing -> reveal -> results`

### Flow
1. Host creates room, players join through room code/QR.
2. On start, backend preloads track pool and transitions to countdown.
3. On each round start, backend emits:
   - track preview
   - answer mode
   - deadline
4. Players submit answers.
5. At deadline, backend locks submissions, evaluates, computes score/streak, emits reveal.
6. After last round, backend emits final ranking and persists history.

### History (intermediate scope)
- Persist final ranking and basic account-linked stats:
  - matches played
  - top1 count
  - best streak

## 5. Scoring And Streak Rules

### Mandatory streak behavior
- Consecutive correct answers apply multiplier escalation:
  - `x1.0 -> x1.1 -> x1.25`, capped at `x1.5`
- Wrong answer or timeout resets streak immediately
- Score computed server-side only

### Tie-breakers
1. Highest max streak
2. Best average response time

## 6. Error Handling And Robustness

### Provider resilience
- Per-provider short timeout
- Temporary circuit breaker
- Automatic fallback to next provider
- If pool is insufficient, controlled degradation:
  - nearby category or adjusted difficulty
  - no silent hard-stop

### Realtime resilience
- Client heartbeat
- Snapshot endpoint for resync (`GET /room/:code/state`)
- If events are missed, client recalibrates to server round/timer state
- Rejoin supported during active game

### Fairness and anti-cheat
- Deadlines enforced server-side
- Single accepted submission per player per round
- Server timestamp authority only

### UX under failure
- Explicit reconnect/resync/loading states
- Retry/rejoin CTA always available
- Continue game from preloaded pool if providers fail mid-session

## 7. Testing Strategy (User-Oriented)

### Unit tests
- `FuzzyMatcher`
- `ScoreCalculator` including streak edge cases
- Room state transitions
- Deadline and submission lock behavior

### Integration tests
- `create -> join -> start -> answer -> reveal -> results`
- Provider fallback simulation: success, timeout, error

### E2E tests (high priority)
- Full mobile user journey with 3+ players:
  - create room
  - join room
  - play 8 rounds
  - final podium
- Real user stress cases:
  - reconnect during round
  - delayed player
  - host skip reveal
- UX consistency checks:
  - synchronized timer
  - correct score/streak display
  - no blocking screen

### Quality gates
- Core E2E failures block PR
- Main branch requires unit + integration + core E2E green

## 8. Implementation Direction

1. Build backend room engine and scoring/streak first.
2. Implement preloaded pool pipeline with provider fallback.
3. Ship core lobby/play/results flow with mixed answer modes.
4. Add history + basic auth integration.
5. Wire full test pyramid, with user-directed E2E as release gate.
