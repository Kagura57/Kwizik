# Reveal Card Playbook (Tunaris)

## Objectif
Conserver un Reveal "waouh" (titre + artiste + artwork) avec un rendu premium, sans duplication visuelle, et sans redémarrage parasite du lecteur.

## Fichiers de référence
- `apps/web/src/routes/room/$roomCode/play.tsx`
- `apps/web/src/routes/room/$roomCode/view.tsx`
- `apps/web/src/styles.css`

## Structure JSX à reproduire
Utiliser exactement cette structure dans les écrans joueur/projection:

```tsx
<div className="reveal-box large reveal-glass">
  <div className="reveal-cover">
    {revealArtwork ? (
      <img src={revealArtwork} alt={`${state.reveal.title} cover`} />
    ) : (
      <div className="reveal-cover-fallback" aria-hidden="true" />
    )}
  </div>
  <div className="reveal-content">
    <p className="kicker">Reveal</p>
    <h3 className="reveal-title">{state.reveal.title}</h3>
    <p className="reveal-artist">{state.reveal.artist}</p>
  </div>
</div>
```

## Principes design appliqués
- **Glassmorphism lisible**: fond multi-couches + blur (`.reveal-glass`).
- **Hiérarchie forte**: `kicker` petit + `reveal-title` très visible + `reveal-artist` en secondaire.
- **Artwork mis en avant**: bloc carré fixe (`.reveal-cover`) avec fallback gradient.
- **Cohérence cross-écran**: même composant visuel dans `play.tsx` et `view.tsx`.

## Classes CSS clés
- `.reveal-box.large`: largeur pleine du conteneur.
- `.reveal-glass`: grille 2 colonnes, fond glass + blur.
- `.reveal-cover`: bloc artwork (132x132), border + shadow.
- `.reveal-content`: stack texte.
- `.reveal-title`: typo display (Bebas Neue) + taille responsive.
- `.reveal-artist`: style secondaire lisible.

## Logique anti-bug playback (important)
Pour éviter la barre/progression qui "repart" 2 fois au Reveal:

1. Stabiliser le média YouTube via `stableYoutubePlayback` (clé provider+trackId).
2. Ne pas réinitialiser ce playback entre `reveal` et `leaderboard`.
3. N'activer l'état visuel Reveal vidéo que sur les phases non-playing/non-waiting/non-results.
4. Garder l'iframe cachée hors Reveal via `blindtest-video-hidden` au lieu de démonter/remonter inutilement.

## Règle de non-régression
- Ne jamais afficher deux fois la réponse (pas de "Réponse attendue" redondant quand titre+artiste sont déjà visibles).
- Maintenir la même source JSX/CSS sur `play.tsx` et `view.tsx`.
- Si refonte future: ajuster style via CSS classes existantes avant de changer la structure JSX.
