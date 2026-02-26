# First Deploy Railway (Tunaris)

Ce guide déploie `web + api + postgres + redis` sur Railway.

## 1. Préparer le repo

- Branche propre, puis push sur GitHub.
- Vérifie que ces scripts existent:
  - API: `apps/api/package.json` -> `start: bun src/index.ts`
  - Web: `apps/web/package.json` -> `start: vite preview ... --port $PORT`

## 2. Créer le projet Railway

- Crée un projet Railway.
- Connecte le repo GitHub `tunaris`.

## 3. Créer les services

Crée 4 services:

1. `api` (source: repo, root directory `apps/api`)
2. `web` (source: repo, root directory `apps/web`)
3. `postgres` (Railway PostgreSQL plugin)
4. `redis` (Railway Redis plugin)

Les fichiers de config Railway sont déjà prêts:

- `apps/api/railway.toml`
- `apps/web/railway.toml`
- Ces fichiers utilisent `builder = "RAILPACK"` (Nixpacks déprécié).

Si Railway ne détecte pas automatiquement le fichier:

- Service `api` -> Settings -> Config as Code -> path: `apps/api/railway.toml`
- Service `web` -> Settings -> Config as Code -> path: `apps/web/railway.toml`
- Vérifie aussi dans l'UI que le builder affiché est bien `Railpack`.

Note:

- Les commandes dans ces `railway.toml` gèrent les deux cas:
  - service lancé depuis la racine du monorepo
  - service lancé avec `Root Directory` déjà positionné sur `apps/api` ou `apps/web`

## 4. Config service API

Dans le service `api`:

- Build/start command: pris depuis `apps/api/railway.toml`

Variables à définir:

- modèle dispo: `apps/api/railway.env.example`
- `DATABASE_URL` (injectée par service Postgres)
- `REDIS_URL` (injectée par service Redis)
- `BETTER_AUTH_SECRET` (long secret)
- `BETTER_AUTH_URL` (URL publique du service API, ex: `https://api-xxx.up.railway.app`)
- `BETTER_AUTH_TRUSTED_ORIGINS` (URL publique du web, ex: `https://web-xxx.up.railway.app`)
  - Valeur exacte de l'origine web (https + domaine exact, sans trailing slash).
  - Plusieurs origines: liste séparée par virgules.
- `MUSIC_TOKEN_ENCRYPTION_KEY` (fortement recommandé)
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_OAUTH_REDIRECT_URI` = `https://<api-domain>/account/music/spotify/connect/callback`
- `DEEZER_APP_ID` / `DEEZER_APP_SECRET` / `DEEZER_OAUTH_REDIRECT_URI` (si Deezer actif)
- `YOUTUBE_API_KEY` (ou `YOUTUBE_API_KEYS`)
- `DEEZER_ENABLED=true`
- `LOG_LEVEL=info`

Important:

- `PORT` est fourni automatiquement par Railway.
- L'API lit maintenant `process.env.PORT`.

## 5. Config service Web

Dans le service `web`:

- Build/start command: pris depuis `apps/web/railway.toml`
- `apps/web/railway.toml` force Node 22 pour le build (`RAILPACK_NODE_VERSION`)

Variables à définir:

- modèle dispo: `apps/web/railway.env.example`
- `VITE_API_BASE_URL=https://<api-domain>`
  - Doit pointer vers le même domaine API que `BETTER_AUTH_URL`.

## 6. Migration DB en prod

Après le premier deploy API, lance la migration dans le shell Railway du service API:

```bash
bun src/db/migrate.ts
```

## 7. Vérifications rapides

API:

- `GET https://<api-domain>/health/details` doit répondre `ok: true`.
- Vérifie `integrations` et `providers`.

Web:

- Ouvre l'app.
- Connecte Spotify.
- Clique sync si besoin.
- Crée une room et lance une partie.

## 8. Points d'attention

- Si `/music/library/sync` renvoie `503`, vérifier `REDIS_URL` et le service Redis.
- Si auth social ne revient pas, vérifier `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, et les redirect URIs Spotify/Deezer.
- Si CORS/cookies bloquent, garder `web` dans `BETTER_AUTH_TRUSTED_ORIGINS` exact (https, domaine exact).

## 9. GitHub Actions (CI + deploy Railway)

Workflows attendus:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-api.yml`
- `.github/workflows/deploy-web.yml`

Secrets GitHub requis:

- `RAILWAY_TOKEN`

Variables GitHub (Repository Variables) requises:

- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT` (optionnel, défaut recommandé: `production`)
- `RAILWAY_API_SERVICE_NAME` (optionnel, défaut: `api`)
- `RAILWAY_WEB_SERVICE_NAME` (optionnel, défaut: `web`)

Note:

- Les workflows deploy utilisent la Railway CLI (`railway up ...`), pas l'action `railwayapp/railway-github-action`.
- Si tu vois `Unable to resolve action railwayapp/railway-github-action, repository not found`, c'est qu'un ancien workflow est encore actif dans la branche exécutée.

## 10. Diagnostic rapide `403 Invalid origin` en production

Symptôme:

- `POST /auth/sign-up/email` ou `POST /auth/sign-in/email` -> `403` avec message `Invalid origin`.

Checklist:

1. `BETTER_AUTH_URL` = domaine public API exact (ex: `https://api-production-0556.up.railway.app`)
2. `BETTER_AUTH_TRUSTED_ORIGINS` contient le domaine web exact (ex: `https://web-production-340b0.up.railway.app`)
3. Les deux services ont redéployé après changement de variables.
4. Le frontend appelle bien `VITE_API_BASE_URL=https://api-production-0556.up.railway.app`
