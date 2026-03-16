# Blindtest Anime Aleatoire Global

- [x] Explorer le flux existant des modes source, des reglages de room et du demarrage de partie.
- [x] Clarifier le comportement exact attendu pour le mode blindtest anime aleatoire hors listes utilisateurs.
- [x] Valider un design minimal et elegant pour le nouveau mode.
- [x] Ecrire le design dans `docs/plans/2026-03-13-random-anime-blindtest-design.md`.
- [x] Ecrire le plan d'implementation dans `docs/plans/2026-03-13-random-anime-blindtest.md`.
- [x] Implementer le mode approuve.
- [x] Verifier avec tests cibles et revue finale.

## Review

- Design valide: nouveau mode anime aleatoire classique hors bibliotheques AniList des joueurs, avec tirage frais par partie depuis une source distante puis mapping AnimeThemes.
- Contrainte clef validee: l'aleatoire prime sur tout fallback de pool; aucun pool preconstruit ne doit etre reutilise entre parties pour ce mode.
- Contrainte produit supplementaire: l'aleatoire doit rester une priorite sur l'ensemble de l'application, y compris pour les tirages AniList existants.
- Root cause (synthese): le besoin etait de verrouiller une verification finale complete du mode `random_classic` apres implementation des taches precedentes, avec preuve de non-regression sur les suites ciblees.
- Implementation finale (synthese): le mode `random_classic` est bien expose bout-en-bout (settings room, parsing/resolution source, construction de pool aleatoire AniList fraiche par partie) et la verification finale a ete executee sans modifier le code feature.
- Follow-up prod: le start `random_classic` n'echoue plus trop tot avec `NO_TRACKS_FOUND` quand un premier tirage AniList frais recoupe mal le miroir AnimeThemes; le backend elargit maintenant la decouverte sur plusieurs tirages frais dans le meme demarrage, surface `ANILIST_REMOTE_FAILURE` explicitement en cas de panne AniList totale, et conserve les reglages host v1 lors de la migration de storage v2.
- Verification executee:
  - `bun test apps/api/tests/room-anime-mode.spec.ts apps/api/tests/room-routes.spec.ts apps/api/tests/anilist-random-anime-source.spec.ts apps/api/tests/track-source-resolver.spec.ts` ✅ PASS (19 tests).
  - `bun test apps/api/tests/room-store.spec.ts -t "random_classic|unbiased AniList random draw"` ✅ PASS (3 tests).
  - `bun test apps/web/src/lib/userGameSettingsMemory.spec.ts apps/web/src/routes` ✅ PASS (13 tests).
  - `npx playwright test apps/web/e2e/live-blindtest.spec.ts --grep "random classic"` ✅ PASS (1 test).
  - `bun test apps/api/tests/anilist-random-anime-source.spec.ts` ✅ PASS (9 tests) apres elargissement du tirage AniList au-dela de 120 IDs.
  - `bun test apps/api/tests/room-store.spec.ts -t "random_classic|ANILIST_REMOTE_FAILURE|unbiased AniList random draw"` ✅ PASS (5 tests), dont le cas reel "premier tirage sans match jouable puis elargissement".
  - `bun test apps/web/src/routes` ✅ PASS (7 tests) apres alignement du code d'erreur `ANILIST_REMOTE_FAILURE` jusqu'au front.
  - `bun run lint` ✅ PASS avec warnings observes (`Found 49 warnings and 0 errors`); ce closeout ne prouve pas la baseline historique de ces warnings.
  - `bun test` ⚠️ ECHEC observe; la causalite par rapport a cette tache n'a pas ete investiguee dans ce closeout:
    - `apps/api/tests/room-store-romaji.spec.ts` -> `RoomStore romaji answer matching > accepts text answers written in romaji for japanese tracks` (attendu `mcq`, recu `text`).
    - Erreurs Playwright d'initialisation pendant `bun test` sur `apps/web/e2e/toast-feedback.spec.ts`, `apps/web/e2e/core-flow.spec.ts`, `apps/web/e2e/live-blindtest.spec.ts` (`Playwright Test did not expect test() to be called here`).

# Gameplay Scrollbar Fix

- [x] Confirm the room gameplay layout pieces that contribute to document scrolling.
- [x] Adjust the gameplay shell so the active game fits inside the viewport without page scrollbars.
- [x] Verify the affected app behavior with targeted checks.

## Review

- `bun test apps/web/src/routes` passed.
- `bun run lint` passed with pre-existing warnings unrelated to this CSS change.
- Attempted local browser verification via `bun run dev:web`, but the sandbox could not provide a usable Vite port, so no live viewport measurement was possible in-session.

# Answer Select Visibility Fix

- [x] Confirm the controlled `react-select` flow and the CSS affecting the answer field.
- [x] Validate the fix approach for selected-value visibility.
- [x] Apply the minimal fix so the chosen anime remains visible in the field.
- [x] Verify with targeted checks and a browser pass on the gameplay screen.

## Review

- Root cause: the global `input` styles were leaking into the internal `react-select` input used to render the selected text in the controlled answer field.
- Fix: locally reset the nested `.answer-select__input-container input` styles so the selected anime stays visible after selection.
- `bun test apps/web/src/routes` passed.
- `npx playwright test apps/web/e2e/live-blindtest.spec.ts --grep "text answer select keeps the chosen anime visible after selection"` passed.
- A fresh `bun run dev:web` instance could not start because ports `5173-65535` were already occupied, so browser verification reused the existing server already answering on `http://127.0.0.1:5173`.

# English Title Preference QCM Fix

- [x] Confirm which QCM screen still renders romaji despite the English title preference.
- [x] Apply the minimal fix so the affected QCM screen uses the saved title preference.
- [x] Add a targeted regression test for English-preference MCQ labels.
- [x] Verify the behavior with focused checks and record the result.

## Review

- Root cause: the projection QCM screen in `apps/web/src/routes/room/$roomCode/view.tsx` always formatted MCQ labels in romaji/mixed form and never loaded the saved title preference.
- Fix: load `/account/preferences/title` in projection mode with an unauthenticated fallback to `mixed`, then apply that preference to both MCQ labels and reveal titles.
- Added regression coverage in `apps/web/e2e/live-blindtest.spec.ts` for a projection MCQ round that must render `Attack on Titan - OP1` when the saved preference is `english`.
- `npx playwright test apps/web/e2e/live-blindtest.spec.ts --grep "projection mcq uses english titles when english preference is selected"` passed.
- `bun test apps/web/src/routes` passed.
- `npx playwright test apps/web/e2e/live-blindtest.spec.ts` still has an unrelated failing test: `anime round keeps video hidden during guessing then reveals without restart` cannot find `video.anime-video-hidden`.

# Player QCM English Alias Fallback Fix

- [x] Trace the real `/play` bug path and confirm whether the player UI or backend choice payload is missing English titles.
- [x] Apply the minimal fix on the player game data path so MCQ choices can use synced English aliases when `title_english` is absent.
- [x] Add a targeted regression test for anime MCQ payloads with alias-only English titles.
- [x] Verify the targeted checks and record remaining unrelated failures.

## Review

- Root cause: the `/play` screen already respected `titlePreference`, but many anime choices arrived without `titleEnglish` because `anime_catalog_anime.title_english` was null even when an English AniList alias already existed.
- Fix: `apps/api/src/services/RoomStore.ts` now falls back to the best English-looking synced alias when `track.answer.englishTitle` is empty, while rejecting derived aliases whenever an exact canonical alias already exists for the series title. That blocks wrong labels such as `Naruto the Movie...` or `One Piece: Clockwork Island Adventure`.
- Added regression coverage in `apps/api/tests/room-store.spec.ts` for `Kimetsu no Yaiba: Yuukaku-hen`, `Naruto`, and `One Piece`, ensuring the choice payload exposes `Demon Slayer: Kimetsu no Yaiba Entertainment District Arc` but keeps canonical series titles for `Naruto` and `One Piece`.
- `bun test apps/api/tests/room-store.spec.ts -t "falls back to an english anime alias when title_english is missing"` passed.
- `bun test apps/web/src/routes` passed.
- A full `bun test apps/api/tests/room-store.spec.ts` run still contains an unrelated pre-existing failure: `uses an unbiased AniList random draw without recent-history exclusions`.

# AniList English Title Backfill Fix

- [x] Verify from AniList GraphQL documentation and live API responses how to retrieve the English anime title.
- [x] Backfill missing anime `title_english` values from AniList during anime pool preparation instead of relying only on local alias heuristics.
- [x] Add targeted tests for the AniList lookup behavior and keep the player route checks green.
- [x] Record the result and remaining unrelated failures.

## Review

- Confirmed against AniList GraphQL that `Media(search: ..., type: ANIME) { title { english } }` returns the English title for entries like `Kono Kaisha ni Suki na Hito ga Imasu`.
- Fix: added `apps/api/src/services/AniListTitleLookup.ts` and wired `apps/api/src/services/RoomStore.ts` to backfill missing `title_english` values from AniList during AniList-union pool construction, then persist them locally.
- Follow-up fix: removed the partial per-pool cap and now backfill every selected missing-English anime for a new game in small batches, so later choices in the same session no longer fall back to romaji just because they were beyond an earlier lookup cap.
- This avoids false romaji fallbacks such as `Kono Kaisha ni Suki na Hito ga Imasu` when AniList already exposes `I Have a Crush at Work`.
- `bun test apps/api/tests/anilist-title-lookup.spec.ts` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "falls back to an english anime alias when title_english is missing"` passed.
- `bun test apps/web/src/routes` passed.

# Batch Plan Continuation

- [x] Task 10: Add AniList popularity-backed difficulty filter end-to-end.
- [x] Task 11: Add year/genre content filters end-to-end.
- [x] Task 12: Add lives mode with elimination and spectator behavior.

## Review

- Confirmed the plan source in `docs/plans/2026-03-11-kwizik-batch-features-implementation-plan.md`.
- Confirmed Tasks 8 and 9 are already implemented in the working tree even though they were never logged here.
- Implemented Task 10 via the AniList sync pipeline and room settings flow, rather than the more expensive global catalog refresh path. This keeps popularity metadata aligned with the actual AniList-synced libraries used by `anilist_union`.
- Added a host-only difficulty setting with snapshot exposure, HTTP route support, and lobby UI controls (`Facile`, `Moyen`, `Difficile`, `Tous`).
- Applied the difficulty SQL condition to AniList pool selection only, using popularity thresholds of `>= 100000` for easy, `30000-99999` for medium, and `< 30000` for hard.
- Extended AniList catalog metadata persistence to store `anilist_popularity`, and laid the schema groundwork for upcoming `year` and `genres` filters.
- Follow-up fix: a difficulty-filtered AniList start no longer dies with `NO_TRACKS_FOUND` just because existing catalog rows still have `anilist_popularity = null`. `RoomStore` now backfills AniList metadata on demand before failing the start, then retries the filtered pool build.
- Follow-up fix: the web client now gives `/quiz/start` a longer timeout, because AniList difficulty starts can legitimately perform on-demand metadata backfills before the API answers.
- Follow-up fix: AniList metadata lookups during `/quiz/start` are now batched per request so the selected difficulty filter stays strict without paying the earlier title-by-title latency cost.
- Follow-up fix: AniList game starts now draw from a much larger candidate window before splitting answers and QCM distractors, which reduces the repeated-opening / repeated-choice feel that easy mode showed with a too-small sampled subset.
- Follow-up fix: difficulty-filtered AniList starts now backfill popularity toward a substantial filtered candidate pool, not just the bare minimum rounds, and `hard` no longer treats `null` popularity as `0`.
- `bun test apps/api/tests/anilist-room-filters.spec.ts` passed.
- `bun test apps/api/tests/anilist-sync-worker.spec.ts` passed.
- `bun test apps/api/tests/anilist-title-lookup.spec.ts` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "AniList difficulty filter"` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "difficulty"` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "unbiased AniList random draw"` passed.
- `bun test apps/api/tests/room-store.spec.ts` passed.
- `bun test apps/api/tests/room-routes.spec.ts` passed.
- `bun test apps/web/src/routes` passed.
- `bun run lint` passed with pre-existing warnings unrelated to this task.
- Task 11 implementation: added host-configurable AniList content filters for decades and genres, persisted them in room state, exposed them via `/quiz/settings/content-filters`, and applied them to AniList pool SQL with on-demand AniList metadata backfill for missing `year` / `genres`.
- Task 12 implementation: added host-configurable lives mode via `/quiz/settings/lives`, tracked `lives` / `isEliminated` per player, excluded eliminated spectators from guess/skip/readiness counts, and ended the game early once one active player remained.
- UI follow-up: the lobby now exposes decade, genre, and lives controls; the live leaderboard shows hearts; eliminated players see spectator-only gameplay instead of answer controls.
- `bun test apps/api/tests/anilist-room-filters.spec.ts` passed.
- `bun test apps/api/tests/room-routes.spec.ts` passed.
- `bun test apps/api/tests/room-store.spec.ts` passed.
- `bun test apps/web/src/routes` passed.
- `bun run lint` completed with pre-existing warnings in unrelated files plus existing warning-only issues already present in `play.tsx` / `view.tsx`; no new lint errors blocked the batch.

# QCM Anime Duplicate Choices Fix

- [x] Confirm how MCQ distractors are deduplicated for anime rounds.
- [x] Prevent multiple choices from resolving to the same anime canonical title in a single MCQ.
- [x] Add a regression test covering multiple themes from the same anime in one choice pool.
- [x] Verify with targeted backend tests.

## Review

- Root cause: `RoomStore.buildRoundChoices()` only deduplicated MCQ options by the full label `title - themeLabel`, so `One Piece - OP2` and `One Piece - OP23` could coexist even though the anime answer should collapse to the same canonical series.
- Fix: MCQ distractor selection now tracks a canonical anime identity derived from `answer.canonical` when available, with an `animethemes` fallback on the anime title, and rejects any second choice sharing that identity.
- Added regression coverage in `apps/api/tests/room-store.spec.ts` for a round containing two `One Piece` themes plus fallback distractors, asserting that only one `ワンピース` option survives and the fourth slot is filled by another anime instead.
- `bun test apps/api/tests/room-store.spec.ts -t "deduplicates MCQ anime choices by canonical anime title"` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "falls back to an english anime alias when title_english is missing"` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "builds MCQ choices with coherent language distractors when enough candidates exist"` passed.
- `bun test apps/api/tests/room-store.spec.ts` passed.

# User Game Settings Memory

- [x] Review existing lessons, project instructions, and current room settings flow.
- [x] Confirm which "user game settings" must persist and across which boundary (refresh, room replay, or new room).
- [x] Validate a design for persisting those settings with minimal impact.
- [x] Implement the approved persistence behavior.
- [x] Add regression coverage for the persisted settings path.
- [x] Verify with targeted tests and document the result.

## Review

- Boundary confirmed: persist the host-controlled lobby settings in browser-local memory so they can be restored on refresh, replay, and newly created rooms without adding backend/profile storage.
- Design confirmed: only auto-restore when the current host lobby is still at the pristine default configuration, so we never overwrite an already-configured room.
- Implemented `apps/web/src/lib/userGameSettingsMemory.ts` to normalize, persist, reload, and compare remembered lobby settings in `localStorage`.
- `apps/web/src/routes/room/$roomCode/play.tsx` now saves remembered settings after host lobby mutations and before `Rejouer`, then silently reapplies them when a host returns to a waiting lobby still on default settings.
- Added `apps/web/src/lib/userGameSettingsMemory.spec.ts` to cover persistence, room-state mapping, and the restore guard that prevents overwriting already-configured rooms.
- `bun test apps/web/src/lib/userGameSettingsMemory.spec.ts apps/web/src/routes` passed.
- `./node_modules/.bin/oxlint 'apps/web/src/routes/room/$roomCode/play.tsx' apps/web/src/lib/userGameSettingsMemory.ts apps/web/src/lib/userGameSettingsMemory.spec.ts` reported only pre-existing warnings in `play.tsx`; no new lint errors blocked the task.

# Lives Mode Solo Round Count Fix

- [x] Trace the lives-mode early-end path and confirm why solo games stop after one round.
- [x] Apply the minimal backend fix so lives mode only shortens true multi-player games.
- [x] Add a regression test for solo lives-mode rooms.
- [x] Verify targeted tests and document the result.

## Review

- Root cause: `RoomStore` shortened `totalRounds` whenever lives mode saw `<= 1` active player after scoring, which is always true in a solo room and forced the game to become `1/1` on the first reveal.
- Fix: the early-end rule now applies only when the room still has more than one player, so solo lives-mode games keep their configured round count.
- Added a regression in `apps/api/tests/room-store.spec.ts` for a solo room with lives mode enabled, asserting that round one keeps `totalRounds = 3` and the room advances to round two instead of collapsing to results.
- `bun test apps/api/tests/room-store.spec.ts -t "eliminates players in lives mode, excludes spectators from later rounds, and ends early with one survivor"` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "does not collapse a solo lives-mode game to one round"` passed.

# Lives Mode Solo Elimination End Fix

- [x] Confirm why a solo player with zero lives remains in spectator mode instead of ending the game.
- [x] Adjust the lives-mode early-end logic to finish when no active players remain, without reintroducing the earlier solo `1/1` regression.
- [x] Add or update regression coverage for both solo-survives and solo-eliminated flows.
- [x] Verify targeted tests and document the result.

## Review

- Root cause: the previous solo fix removed the `<= 1 active player` cutoff entirely for one-player rooms, so a solo host with `0` lives stayed in spectator mode while the round loop kept advancing.
- Fix: `RoomStore` now ends lives mode early when there are `0` active players left, and still ends at `1` survivor only for rooms that actually started multiplayer.
- Updated regression coverage in `apps/api/tests/room-store.spec.ts` with two solo cases: one where the player survives round one and the game continues to round two, and one where the player loses the last life and the game ends after that reveal.
- `bun test apps/api/tests/room-store.spec.ts -t "eliminates players in lives mode, excludes spectators from later rounds, and ends early with one survivor"` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "does not collapse a solo lives-mode game while the player is still alive"` passed.
- `bun test apps/api/tests/room-store.spec.ts -t "ends a solo lives-mode game when the last player is eliminated"` passed.
