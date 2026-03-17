import type { SupportedLocale } from "../locale";
import { HttpStatusError } from "../../lib/api";
import { pickCopy, type LocalizedCopy } from "./types";

const projectionCopy = {
  en: {
    projection: "Projection",
    round: "Round",
    playbackTitle: "Projection playback",
    loadingVideo: "Loading video...",
    readySync: "Projection ready, waiting for synchronized start...",
    localPrep: "Preparing the projection locally...",
    buffering: "Buffering...",
    ready: "ready",
    textModeHint: "Text mode: find the title or artist",
    reveal: "Reveal",
    answerValidated: "Answer validated",
    noAnswer: "No answer",
    points: "pts",
    revealArtworkAlt: "cover art",
  },
  fr: {
    projection: "Projection",
    round: "Manche",
    playbackTitle: "Lecture projection",
    loadingVideo: "Chargement de la vidéo...",
    readySync: "Projection prête, en attente du départ synchronisé...",
    localPrep: "Préparation locale de la projection...",
    buffering: "Mise en mémoire tampon...",
    ready: "prête",
    textModeHint: "Mode texte : trouver le titre ou l'artiste",
    reveal: "Révélation",
    answerValidated: "Réponse validée",
    noAnswer: "Pas de réponse",
    points: "pts",
    revealArtworkAlt: "illustration",
  },
} satisfies LocalizedCopy<{
  projection: string;
  round: string;
  playbackTitle: string;
  loadingVideo: string;
  readySync: string;
  localPrep: string;
  buffering: string;
  ready: string;
  textModeHint: string;
  reveal: string;
  answerValidated: string;
  noAnswer: string;
  points: string;
  revealArtworkAlt: string;
}>;

export function getProjectionCopy(locale: SupportedLocale) {
  return pickCopy(projectionCopy, locale);
}

export function getProjectionSnapshotErrorMessage(error: unknown, locale: SupportedLocale) {
  if (
    error instanceof HttpStatusError &&
    error.status === 404 &&
    error.message === "ROOM_NOT_FOUND"
  ) {
    return locale === "en"
      ? "This projection room is no longer available."
      : "La room de projection n'est plus disponible.";
  }
  return locale === "en"
    ? "Unable to synchronize the projection."
    : "Impossible de synchroniser la projection.";
}

export function getProjectionPlaybackErrorMessage(
  provider: string | null,
  locale: SupportedLocale,
) {
  if (provider === "youtube" || provider === "animethemes") {
    return locale === "en"
      ? "Video playback failed on the projection screen."
      : "La lecture vidéo a échoué sur l'écran de projection.";
  }
  return locale === "en"
    ? "Audio error on the current track."
    : "Erreur audio sur la piste en cours.";
}
