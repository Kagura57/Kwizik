import type { SupportedLocale } from "../locale";
import { HttpStatusError } from "../../lib/api";
import { pickCopy, type LocalizedCopy } from "./types";

type AniListLinkStatus = "linked" | "not_linked";

const settingsCopy = {
  en: {
    title: "Settings",
    subtitle: "Connect AniList, choose how titles appear, and track your synced library.",
    authRequired: "Sign in to manage your AniList username.",
    signIn: "Sign in",
    backHome: "Back home",
    loadingAccount: "Loading account...",
    summaryKicker: "Account",
    summaryTitle: "Profile overview",
    summaryHint: "Your Kwizik session, AniList link, and latest sync status.",
    signedInAs: "Signed in as",
    readiness: "Status",
    summaryReady: "Ready for anime rounds",
    summaryNeedsSetup: "AniList setup incomplete",
    summaryRecovered: "Recovered anime",
    summaryUsernameHint: "Username currently used for AniList sync.",
    connected: "Signed in:",
    aniListUsername: "AniList username",
    saving: "Saving...",
    actionsTitle: "Actions",
    actionsHint: "Update your AniList link and title display preferences.",
    aniListConnection: "AniList connection",
    aniListConnectionHint: "Use your AniList username to sync watching and completed anime.",
    aniListUsernameHint: "This saves the username, then starts a new sync.",
    update: "Update",
    updating: "Updating...",
    sessionActions: "Session",
    sessionHint: "Manage your signed-in session.",
    statusTitle: "Tracking",
    statusHint: "Follow the latest AniList import and the recovered local library.",
    lastSync: "Last sync",
    titlePreference: "Title preference",
    titlePreferenceHint: "Choose how anime titles appear in MCQ answers.",
    mixed: "Mixed",
    romaji: "Romaji",
    english: "English",
    syncState: "Sync overview",
    syncStateHint: "Check whether the latest AniList import is queued, running, or done.",
    progress: "Progress",
    lastRun: "Last run",
    recoveredAnime: "Recovered library",
    recoveredHint: "Anime currently available from your local synced AniList library.",
    loadingLibrary: "Loading library...",
    libraryLoadError: "Unable to load the anime library.",
    libraryEmpty: "No synced anime yet. Run a sync to populate this list.",
    signOut: "Sign out",
    signingOut: "Signing out...",
    signedOut: "Signed out.",
    signOutError: "Unable to sign out right now.",
    syncStarted: "Username updated and AniList sync started.",
    usernameUpdated: "AniList username updated.",
    titlePreferenceUpdated: "Title preference updated.",
    titlePreferenceError: "Unable to update the title preference.",
    accountDescription: "Manage your AniList sync and profile preferences in Kwizik.",
    animeQuiz: "Anime quiz",
    statusWatching: "Watching",
    statusCompleted: "Completed",
    never: "Never",
  },
  fr: {
    title: "Paramètres",
    subtitle: "Connecte AniList, choisis l'affichage des titres et suis ta bibliothèque synchronisée.",
    authRequired: "Connecte-toi pour gérer ton compte et tes réglages AniList.",
    signIn: "Se connecter",
    backHome: "Retour à l'accueil",
    loadingAccount: "Chargement du compte...",
    summaryKicker: "Compte",
    summaryTitle: "Profil et vue d'ensemble",
    summaryHint: "Ta session Kwizik, ton lien AniList et le statut de ta dernière sync.",
    signedInAs: "Connecté en tant que",
    readiness: "État",
    summaryReady: "Prêt pour les manches anime",
    summaryNeedsSetup: "Configuration AniList incomplète",
    summaryRecovered: "Animes récupérés",
    summaryUsernameHint: "Pseudo actuellement utilisé pour la sync AniList.",
    connected: "Connecté :",
    aniListUsername: "Pseudo AniList",
    saving: "Enregistrement...",
    actionsTitle: "Actions",
    actionsHint: "Mets à jour ton lien AniList et tes préférences d'affichage.",
    aniListConnection: "Connexion AniList",
    aniListConnectionHint: "Utilise ton pseudo AniList pour synchroniser tes animes en cours et terminés.",
    aniListUsernameHint: "Ce bouton enregistre le pseudo puis lance une nouvelle sync.",
    update: "Mettre à jour",
    updating: "Mise à jour...",
    sessionActions: "Session",
    sessionHint: "Gère ta session connectée.",
    statusTitle: "Suivi",
    statusHint: "Suis le dernier import AniList et la bibliothèque récupérée localement.",
    lastSync: "Dernière sync",
    titlePreference: "Préférence de titre",
    titlePreferenceHint: "Choisis le format de titre affiché dans les choix QCM anime.",
    mixed: "Mixte",
    romaji: "Romaji",
    english: "Anglais",
    syncState: "Vue de sync",
    syncStateHint: "Vérifie si le dernier import AniList est en file, en cours ou terminé.",
    progress: "Progression",
    lastRun: "Dernière exécution",
    recoveredAnime: "Bibliothèque récupérée",
    recoveredHint: "Animes actuellement disponibles depuis ta bibliothèque AniList synchronisée localement.",
    loadingLibrary: "Chargement de la bibliothèque anime...",
    libraryLoadError: "Impossible de charger la bibliothèque anime.",
    libraryEmpty: "Aucun anime synchronisé pour l'instant. Lance une sync pour remplir cette liste.",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion...",
    signedOut: "Déconnexion effectuée.",
    signOutError: "Impossible de te déconnecter pour le moment.",
    syncStarted: "Pseudo mis à jour et synchronisation AniList lancée.",
    usernameUpdated: "Pseudo AniList mis à jour.",
    titlePreferenceUpdated: "Préférence de titre mise à jour.",
    titlePreferenceError: "Impossible de mettre à jour la préférence de titre.",
    accountDescription: "Gère ta synchronisation AniList et tes préférences de profil dans Kwizik.",
    animeQuiz: "Quiz anime",
    statusWatching: "En cours",
    statusCompleted: "Terminé",
    never: "jamais",
  },
} satisfies LocalizedCopy<{
  title: string;
  subtitle: string;
  authRequired: string;
  signIn: string;
  backHome: string;
  loadingAccount: string;
  summaryKicker: string;
  summaryTitle: string;
  summaryHint: string;
  signedInAs: string;
  readiness: string;
  summaryReady: string;
  summaryNeedsSetup: string;
  summaryRecovered: string;
  summaryUsernameHint: string;
  connected: string;
  aniListUsername: string;
  saving: string;
  actionsTitle: string;
  actionsHint: string;
  aniListConnection: string;
  aniListConnectionHint: string;
  aniListUsernameHint: string;
  update: string;
  updating: string;
  sessionActions: string;
  sessionHint: string;
  statusTitle: string;
  statusHint: string;
  lastSync: string;
  titlePreference: string;
  titlePreferenceHint: string;
  mixed: string;
  romaji: string;
  english: string;
  syncState: string;
  syncStateHint: string;
  progress: string;
  lastRun: string;
  recoveredAnime: string;
  recoveredHint: string;
  loadingLibrary: string;
  libraryLoadError: string;
  libraryEmpty: string;
  signOut: string;
  signingOut: string;
  signedOut: string;
  signOutError: string;
  syncStarted: string;
  usernameUpdated: string;
  titlePreferenceUpdated: string;
  titlePreferenceError: string;
  accountDescription: string;
  animeQuiz: string;
  statusWatching: string;
  statusCompleted: string;
  never: string;
}>;

export function getSettingsCopy(locale: SupportedLocale) {
  return pickCopy(settingsCopy, locale);
}

export function getAniListStatusMeta(status: AniListLinkStatus, locale: SupportedLocale) {
  if (status === "linked") {
    return {
      label: locale === "en" ? "Ready" : "Prêt",
      tone: "connected",
      description:
        locale === "en"
          ? "AniList username is set for anime rounds."
          : "Le pseudo AniList est prêt pour les manches anime.",
    } as const;
  }
  return {
    label: locale === "en" ? "Not set" : "Non configuré",
    tone: "idle",
    description:
      locale === "en"
        ? "Add your AniList username, then click Update."
        : "Ajoute ton pseudo AniList puis clique sur Mettre à jour.",
  } as const;
}

export function getSyncStatusLabel(
  status: "queued" | "running" | "success" | "error" | "idle",
  locale: SupportedLocale,
) {
  if (status === "queued") return locale === "en" ? "Queued" : "En file";
  if (status === "running") return locale === "en" ? "Running" : "En cours";
  if (status === "success") return locale === "en" ? "Completed" : "Terminée";
  if (status === "error") return locale === "en" ? "Error" : "Erreur";
  return locale === "en" ? "Idle" : "Inactive";
}

export function getSyncStatusTone(status: "queued" | "running" | "success" | "error" | "idle") {
  if (status === "error") return "expired";
  if (status === "success" || status === "queued" || status === "running") return "connected";
  return "idle";
}

export function getSettingsPrimaryActionLabel(params: {
  locale: SupportedLocale;
  currentUsername: string;
  nextUsername: string;
}) {
  const currentUsername = params.currentUsername.trim();
  const nextUsername = params.nextUsername.trim();

  if (!nextUsername && currentUsername) {
    return params.locale === "en" ? "Clear username" : "Retirer le pseudo";
  }
  if (!nextUsername && !currentUsername) {
    return params.locale === "en" ? "Add username" : "Ajouter un pseudo";
  }
  if (!currentUsername) {
    return params.locale === "en" ? "Connect & sync" : "Connecter et sync";
  }
  if (currentUsername === nextUsername) {
    return params.locale === "en" ? "Sync again" : "Relancer la sync";
  }
  return params.locale === "en" ? "Update & sync" : "Mettre a jour et sync";
}

export function getSettingsTitlePreferenceLabel(
  titlePreference: "mixed" | "romaji" | "english",
  locale: SupportedLocale,
) {
  if (titlePreference === "romaji") return "Romaji";
  if (titlePreference === "english") return locale === "en" ? "English" : "Anglais";
  return locale === "en" ? "Mixed" : "Mixte";
}

export function getSyncErrorMessage(code: string | null | undefined, locale: SupportedLocale) {
  const normalized = typeof code === "string" ? code.trim() : "";
  if (!normalized) return locale === "en" ? "AniList sync error." : "Erreur de sync AniList.";
  if (normalized === "ANILIST_USERNAME_NOT_SET") {
    return locale === "en"
      ? "Add your AniList username before syncing."
      : "Ajoute ton pseudo AniList avant la sync.";
  }
  if (normalized === "ANILIST_USER_NOT_FOUND") {
    return locale === "en"
      ? "AniList username not found. Check it and try again."
      : "Pseudo AniList introuvable. Vérifie-le puis réessaie.";
  }
  if (normalized === "ANILIST_COLLECTION_GRAPHQL_ERROR") {
    return locale === "en"
      ? "AniList returned an error. Try again in a few seconds."
      : "AniList a renvoyé une erreur. Réessaie dans quelques secondes.";
  }
  if (normalized === "ANIME_CATALOG_EMPTY") {
    return locale === "en"
      ? "The local anime catalog is still empty. Let the API finish refreshing, then try again."
      : "Le catalogue anime local est encore vide. Laisse l'API finir son rafraîchissement puis réessaie.";
  }
  if (normalized.startsWith("ANILIST_COLLECTION_HTTP_")) {
    return locale === "en"
      ? `AniList returned ${normalized.replace("ANILIST_COLLECTION_HTTP_", "HTTP ")}. Try again in a few seconds.`
      : `AniList a renvoyé ${normalized.replace("ANILIST_COLLECTION_HTTP_", "HTTP ")}. Réessaie dans quelques secondes.`;
  }
  if (normalized === "QUEUE_UNAVAILABLE" || normalized === "ENQUEUE_FAILED") {
    return locale === "en"
      ? "The sync queue is currently unavailable."
      : "La file de sync est indisponible pour le moment.";
  }
  return locale === "en" ? `AniList sync error: ${normalized}` : `Erreur de sync AniList : ${normalized}`;
}

export function getSettingsUpdateErrorMessage(error: unknown, locale: SupportedLocale) {
  if (!(error instanceof HttpStatusError)) {
    return locale === "en"
      ? "Unable to update the AniList library."
      : "Impossible de mettre à jour la bibliothèque AniList.";
  }
  if (error.message === "INVALID_ANILIST_USERNAME") {
    return locale === "en"
      ? "Invalid AniList username. Use letters, digits, _ or - only."
      : "Pseudo AniList invalide. Utilise seulement des lettres, chiffres, _ ou -.";
  }
  if (error.message === "ANILIST_USERNAME_NOT_SET") {
    return locale === "en"
      ? "Add your AniList username before updating."
      : "Ajoute ton pseudo AniList avant la mise à jour.";
  }
  if (error.message === "QUEUE_UNAVAILABLE" || error.message === "ENQUEUE_FAILED") {
    return locale === "en"
      ? "Username saved, but the sync queue is unavailable."
      : "Pseudo enregistré, mais la file de sync est indisponible.";
  }
  return locale === "en"
    ? "Unable to update the AniList library."
    : "Impossible de mettre à jour la bibliothèque AniList.";
}

export function formatSettingsSyncTimestamp(ts: number | null | undefined, locale: SupportedLocale) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return locale === "en" ? "Never" : "Jamais";
  }
  return new Date(ts).toLocaleString(locale === "en" ? "en-US" : "fr-FR");
}
