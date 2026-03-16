# Lessons

## 2026-03-13

- Quand un utilisateur demande un mode "simplement aleatoire", ne pas supposer que le catalogue deja synchronise en base est acceptable; verifier explicitement s'il attend un tirage depuis une source distante/globalement fraiche plutot qu'un pool local.
- Pour un mode distant "classique", ne pas proposer un echec utilisateur ou un fallback permanent comme comportement normal; dimensionner le chemin principal pour remplir suffisamment le pool jouable, et n'utiliser le cache que pour accelerer ce meme chemin.
- Si l'utilisateur dit que l'aleatoire parfait prime sur la robustesse cachee, ne reutiliser aucun pool preconstruit entre parties; garder un tirage frais par partie et limiter le cache aux metadonnees techniques qui n'influencent pas la selection.
- Quand un utilisateur dit que l'aleatoire est le point clef du blindtest, propager cette contrainte au-dela du nouveau mode: verifier aussi que les autres tirages anime de l'application restent larges, non repetitifs et non biaises par des pools trop petits.
- Quand un mode aleatoire distant doit ensuite recouper un catalogue jouable local (ex. AniList -> AnimeThemes), ne jamais plafonner la decouverte distante a un petit nombre fixe d'IDs; tester explicitement le cas ou un premier tirage frais n'a aucun match jouable et doit etre elargi avant d'echouer.
- Quand un mode recoupe une source distante avec un catalogue local, verifier que les IDs appartiennent bien au meme domaine; ne jamais traiter des `Media.id` AniList comme des cles primaires internes du catalogue SQL.
- Si l'utilisateur se plaint que les memes animes reapparaissent en bons et mauvais choix, inspecter si les distractors reutilisent des reponses futures; un mode MCQ anime doit privilegier un pool de distractors dedie plutot que recycler les answers des rounds suivants.
- Quand des choix MCQ anime sont deduplices par identite canonique, ne pas s'appuyer uniquement sur une normalisation ASCII; pour les titres CJK, une normalisation qui vide la chaine fait croire que tous les animes japonais sont identiques et casse la selection des distractors.

## 2026-03-16

- Quand un utilisateur recadre une optimisation SEO vers un besoin de traduction, ne pas continuer sur une simple landing monolingue; requalifier explicitement le chantier en SEO bilingue/i18n avant de proposer l'implementation.

## 2026-03-12

- When a user reports that a previously fixed display preference still does not work, verify every screen that renders the same data path, not just the player view that was changed first.
- For gameplay preference bugs, add regression coverage on the exact route the user sees in-session (`/play` vs `/view`) before considering the fix complete.
- When a user explicitly says "directly in the game", confirm the `/play` route and inspect the actual payload fields before changing adjacent screens like `/view`.
- For alias-based title fallbacks, test both directions: one case that should pick a richer English alias and one case that must stay on the canonical series title instead of a movie/spin-off alias.
- If an exact canonical alias already exists for a series, never let a longer derived alias (`Title: ...`, `Title the Movie ...`) win as the displayed English title.
- If AniList already exposes `title.english`, prefer backfilling it from AniList GraphQL over piling more heuristics onto local alias scoring.
- When a new game prepares a selected anime pool, never cap AniList English backfills so aggressively that later rounds in the same session can still surface romaji for otherwise translatable titles.
- When adding a new room filter that depends on backfilled catalog metadata, verify that existing synced rooms can still start before that metadata has been populated in production data.
- When a bug fix makes `/quiz/start` perform extra remote work, recheck the frontend request timeout; a correct backend fix can still look broken if the web client aborts the start request first.
- When timeout logs show a fixed cadence across fallback bases, treat that as an end-to-end timing signal: verify the browser is running the new client code, then bound the server-side remote work instead of only raising the client timeout.
- Never silently degrade a room setting to a different source/filter just to make a failing path pass; if the user selected a mode, fixes must preserve that contract and optimize the real path instead.
- When a user reports that "random" anime rounds keep repeating the same OPs, inspect the actual candidate-pool size and distractor source breadth; a technically random draw from a tiny sampled subset still feels deterministic in production.
- For popularity-based difficulty filters, never treat unknown popularity as low popularity; `null` metadata must be backfilled or excluded, otherwise mainstream anime can leak into `hard` and poison every later diagnosis.
- For anime MCQ rounds, deduplicate choices by the same canonical anime identity used for answer acceptance, not by the rendered `anime - OP/ED` label, or multiple openings from one series can appear as separate "correct" options.
- For lives mode, never apply the "stop when one survivor remains" rule to rooms that started effectively solo; otherwise a single-player lives game collapses to `1/1` on the first reveal even before elimination matters.
- For solo lives mode, distinguish "one active survivor" from "zero active players": a solo room should keep playing while the lone player still has lives, but must end immediately once that player is eliminated.
- When the user explicitly names a required skill, switch to that skill's workflow immediately and avoid re-asking a requirement the user has already confirmed.
