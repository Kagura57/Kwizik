# App Optimization Design

**Date:** 2026-03-16

## Goal

Optimiser l'application avec un ROI global eleve, sans changer le produit visible: reduire les hotspots de complexite backend/frontend, limiter le travail inutile cote gameplay temps reel, et rendre les futures evolutions moins risquées.

## Current Context

- Le backend concentre une grande partie des regles de partie, du build de pool, des projections de snapshot et de la logique MCQ dans [`apps/api/src/services/RoomStore.ts`](../../apps/api/src/services/RoomStore.ts).
- L'ecran de jeu concentre orchestration reseau, mutations host/player, synchronisation live, restauration de reglages, media loading et rendu dans [`apps/web/src/routes/room/$roomCode/play.tsx`](../../apps/web/src/routes/room/$roomCode/play.tsx).
- Le web dispose deja d'un flux temps reel, mais plusieurs mutations declenchent encore des `snapshotQuery.refetch()` redondants.
- Les types room/game sont encore largement dupliques entre l'API et le frontend.

## Constraints

- Tout doit rester fonctionnel.
- Les routes, payloads observables et codes d'erreur existants doivent etre preserves autant que possible.
- Les optimisations doivent etre mesurables ou au minimum defensables en reduction claire de complexite et de trafic inutile.
- Eviter les refactors gratuits et les micro-optimisations sans impact lisible.

## Approaches Considered

### 1. Conservative hotspot cleanup

Refactors mineurs dans `RoomStore` et `play.tsx`, sans vraie extraction de responsabilites.

**Pros**
- Risque faible.
- Rapide a livrer.

**Cons**
- Le gain plafonne vite.
- Les hotspots majeurs restent difficiles a faire evoluer.

### 2. Targeted structural refactor for balanced ROI

Extraire les responsabilites les plus denses du backend, rationnaliser l'orchestration gameplay frontend, et reduire les rafraichissements snapshot inutiles.

**Pros**
- Meilleur ratio impact / risque.
- Combine perf, maintenabilite et robustesse.
- Prepare mieux les prochains chantiers gameplay.

**Cons**
- Demande plus de verification et de discipline de refactor.

### 3. Larger architecture redesign

Decoupage plus profond du moteur de jeu, du contrat API et du state management.

**Pros**
- Base potentiellement la plus propre a long terme.

**Cons**
- Cout trop eleve pour le ROI immediat.
- Risque de regression plus important.

## Chosen Approach

Approche 2: refactor structurel cible.

## Target Design

### Backend

- Extraire la projection de snapshot room dans un module dedie afin de sortir de `RoomStore` la construction du payload frontend.
- Extraire la construction des choix MCQ dans un module dedie pour isoler les heuristiques de coherence et de deduplication.
- Garder `RoomStore` comme orchestrateur d'etat, de transitions et de coordination, pas comme module qui porte chaque transformation.

### Frontend

- Introduire un helper local de rafraichissement snapshot dedupe pour limiter les `refetch()` immediats repetes sur l'ecran de jeu.
- Extraire les helpers mutations host/player les plus repetitifs afin de reduire la duplication, stabiliser les chemins de succes/erreur, et simplifier `play.tsx`.
- Preserver le flux temps reel comme source principale de mise a jour, avec un rafraichissement HTTP reserve aux cas de rattrapage/coherence.

### Shared Contracts

- Deplacer uniquement les types room/game qui suppriment une duplication nette et sans bruit.
- Ne pas chercher a migrer tout le modele d'un coup.

## Error Handling

- Conserver les codes d'erreur backend deja consommes par le frontend.
- Standardiser les helpers de message d'erreur cote frontend quand un meme pattern de mutation se repete.
- Eviter que des refetch globaux masquent des echecs de mutation ou de synchronisation media.

## Verification Strategy

- Tests backend cibles sur `RoomStore` et les modules extraits.
- Tests frontend cibles sur les routes de jeu.
- Build web pour verifier le bundle et l'absence de regression de compilation.
- Lint et revue de diff pour confirmer que le refactor simplifie reellement les hotspots.

## Implementation Scope

1. Extraire les helpers backend de projection snapshot et de choix MCQ.
2. Introduire des types partages minimaux pour le snapshot room.
3. Rationaliser les mutations et rafraichissements snapshot dans `play.tsx`.
4. Verifier le comportement via tests backend/frontend et build web.
