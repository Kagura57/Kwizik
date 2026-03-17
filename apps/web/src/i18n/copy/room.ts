import type { SupportedLocale } from "../locale";
import type { RoomContentFilters } from "../../lib/api";
import { pickCopy, type LocalizedCopy } from "./types";

type SourceMode = "public_playlist" | "players_liked" | "anilist_union" | "random_classic";
type ThemeMode = "op_only" | "ed_only" | "mix";
type DifficultyFilter = "easy" | "medium" | "hard" | "all";

const CONTENT_FILTER_DECADES = [
  { start: 1990, label: "90s" },
  { start: 2000, label: "2000s" },
  { start: 2010, label: "2010s" },
  { start: 2020, label: "2020s" },
] as const;

const roomCopy = {
  en: {
    liveLeaderboard: "Live leaderboard",
    controlRoomKicker: "Control room",
    controlRoomTitle: "Set up the next match",
    controlRoomBody: "The host chooses the anime source, pace, and answer rules while everyone gets ready.",
    liveArenaKicker: "Live arena",
    liveArenaTitle: "Focus on the live round",
    liveArenaBody: "Keep the media stage central, the leaderboard clear, and the side rails secondary.",
    roomSnapshot: "Room summary",
    playersPanel: "Players",
    startZone: "Ready check",
    phaseLabel: "Phase",
    startZoneBody: "Everyone gets ready here. Then the host starts the game.",
    sourceGroup: "Source and themes",
    sourceGroupBody: "Choose the anime pool and whether rounds use openings, endings, or both.",
    filterGroup: "Difficulty and filters",
    filterGroupBody: "Refine the AniList pool by popularity, decade, and genre.",
    rulesGroup: "Pace and answer rules",
    rulesGroupBody: "Set lives, round count, timings, and answer format.",
    round: "Round",
    room: "Room",
    noAnswer: "No answer",
    answerValidated: "Answer validated",
    points: "pts",
    leaderboardEmpty: "The leaderboard appears once players join.",
    playbackTitle: "Blind test playback",
    loadingVideo: "Loading video...",
    readySync: "Ready locally, waiting for room sync...",
    warmupCheck: "Checking local playback...",
    playbackStarted: "Playback started",
    buffering: "Buffering...",
    ready: "ready",
    waitingTitle: "The host can start at any time.",
    resolvingSources: "Preparing audio sources...",
    preparingPlaylist: "Preparing the players' playlist...",
    sourceModeHost: "Source mode (host)",
    sourceAniListTitle: "Synced AniList",
    sourceAniListBody: "Union of connected players' libraries",
    sourceRandomTitle: "Classic random anime blind test",
    sourceRandomBody: "A fresh global anime draw for each game",
    sourceAniListHint: "Players' synced AniList libraries are used automatically.",
    themeMode: "Theme mode",
    openingsOnly: "Openings only",
    endingsOnly: "Endings only",
    openingsAndEndings: "Openings + Endings",
    aniListDifficulty: "AniList difficulty",
    easy: "Easy",
    easyHint: "Very popular hits",
    medium: "Medium",
    mediumHint: "Mid-popularity titles",
    hard: "Hard",
    hardHint: "More niche series",
    all: "All",
    allHint: "No popularity filter",
    decades: "Decades",
    genres: "Genres",
    livesMode: "Lives mode",
    eliminationAtZero: "Eliminate at zero lives",
    classicScore: "Classic scoring",
    rounds: "Rounds",
    guessDuration: "Guess time",
    revealDuration: "Reveal time",
    answerMode: "Answer mode",
    mcq: "MCQ",
    mcqOnly: "Multiple choice only",
    text: "Text",
    textOnly: "Free-text answers only",
    mixed: "Mixed",
    mixedHint: "Alternate MCQ / Text",
    hostOnlyConfig: "Only the host can change these settings.",
    sourceModeLabel: "Source mode",
    playlist: "Playlist",
    noPlaylist: "No playlist selected",
    difficulty: "Difficulty",
    readyToggleOn: "I'm ready",
    readyToggleOff: "I'm not ready",
    starting: "Starting...",
    startGame: "Start game",
    playersReady: "Players ready",
    player: "Player",
    host: "Host",
    readyStatus: "Ready",
    waitingStatus: "Waiting",
    kick: "Kick",
    eliminated: "Eliminated",
    spectator: "Spectator",
    off: "Off",
    openingsShort: "OP only",
    endingsShort: "ED only",
    revealArtworkAlt: "cover art",
    spectatorHint: "Spectator mode is active. You can follow the round without answering.",
    answerLabel: "Answer (anime title)",
    answerPlaceholder: "Anime title",
    answerTypePrompt: "Type an anime title",
    loadingAnime: "Loading anime titles...",
    noSuggestion: "No suggestions",
    answerSent: "Answer sent",
    sending: "Sending...",
    validate: "Submit",
    waitingOthers: "Waiting for others...",
    validation: "Validation",
    reveal: "Reveal",
    nextVotes: "Next votes",
    next: "Next",
    skip: "Skip",
    final: "Final",
    finalPodium: "Final podium",
    noPlayer: "No player",
    leaveRoom: "Leave room",
    backLobby: "Back to lobby...",
    replay: "Play again",
    hostCanReplay: "The host can return everyone to the lobby.",
    chat: "Chat",
    noMessage: "No messages yet.",
    message: "Message",
    messagePlaceholder: "Write to the room...",
    send: "Send",
    roomLeft: "You left the room.",
    sourceModeUpdated: "Source mode",
    themeModeUpdated: "Theme mode",
    configUpdateError: "Unable to update the settings.",
    answerModeUpdated: "Answer mode",
    answerModeError: "Unable to change the answer mode.",
    difficultyUpdated: "Difficulty",
    contentFiltersUpdated: "Filters updated.",
    contentFiltersError: "Unable to update the filters.",
    livesModeError: "Unable to change lives mode.",
    publicPlaylistUpdated: "Public playlist",
    youAreReady: "You are ready.",
    noLongerReady: "You are no longer ready.",
    playerKicked: "Player kicked.",
    returnedLobby: "Back to the lobby.",
    settingsRestored: "Previous settings restored.",
    settingsRestoreError: "Unable to restore the previous settings.",
    playbackUnavailable: "Audio error: sample unavailable.",
    themeLoadingLong: "Theme loading is taking longer than expected...",
    themeLoadingRetry: "Theme is still loading. Retrying...",
  },
  fr: {
    liveLeaderboard: "Classement live",
    controlRoomKicker: "Salle de contrôle",
    controlRoomTitle: "Prépare la prochaine partie",
    controlRoomBody: "Le host choisit la source anime, le rythme et les règles pendant que tout le monde se prépare.",
    liveArenaKicker: "Arène live",
    liveArenaTitle: "Reste concentré sur la manche",
    liveArenaBody: "Garde la scène média au centre, le classement lisible et les panneaux latéraux secondaires.",
    roomSnapshot: "Résumé de la room",
    playersPanel: "Joueurs",
    startZone: "Validation avant départ",
    phaseLabel: "Phase",
    startZoneBody: "Tout le monde se prépare ici. Ensuite, le host lance la partie.",
    sourceGroup: "Source et thèmes",
    sourceGroupBody: "Choisis le pool anime et si les manches utilisent des openings, des endings ou les deux.",
    filterGroup: "Difficulté et filtres",
    filterGroupBody: "Affinez le pool AniList par popularité, décennie et genre.",
    rulesGroup: "Rythme et règles de réponse",
    rulesGroupBody: "Règle les vies, le nombre de manches, les timings et le format de réponse.",
    round: "Manche",
    room: "Room",
    noAnswer: "Pas de réponse",
    answerValidated: "Réponse validée",
    points: "pts",
    leaderboardEmpty: "Le classement apparaît dès que des joueurs rejoignent la room.",
    playbackTitle: "Lecture du blind test",
    loadingVideo: "Chargement de la vidéo...",
    readySync: "Prêt localement, en attente de la sync de la room...",
    warmupCheck: "Vérification locale de la lecture...",
    playbackStarted: "Lecture démarrée",
    buffering: "Mise en mémoire tampon...",
    ready: "prêt",
    waitingTitle: "Le host peut lancer la partie à tout moment.",
    resolvingSources: "Préparation des sources audio...",
    preparingPlaylist: "Préparation de la playlist des joueurs...",
    sourceModeHost: "Mode source (host)",
    sourceAniListTitle: "AniList synchronisé",
    sourceAniListBody: "Union des listes des joueurs connectés",
    sourceRandomTitle: "Blind test anime aléatoire classique",
    sourceRandomBody: "Un tirage global frais à chaque partie",
    sourceAniListHint: "Les bibliothèques AniList synchronisées des joueurs sont utilisées automatiquement.",
    themeMode: "Mode de thèmes",
    openingsOnly: "Openings uniquement",
    endingsOnly: "Endings uniquement",
    openingsAndEndings: "Openings + Endings",
    aniListDifficulty: "Difficulté AniList",
    easy: "Facile",
    easyHint: "Très gros classiques",
    medium: "Moyen",
    mediumHint: "Popularité intermédiaire",
    hard: "Difficile",
    hardHint: "Séries plus niche",
    all: "Tous",
    allHint: "Aucun filtre de popularité",
    decades: "Décennies",
    genres: "Genres",
    livesMode: "Mode vies",
    eliminationAtZero: "Élimination à zéro vie",
    classicScore: "Score classique",
    rounds: "Manches",
    guessDuration: "Temps de réponse",
    revealDuration: "Temps de révélation",
    answerMode: "Mode de réponse",
    mcq: "QCM",
    mcqOnly: "Choix multiples uniquement",
    text: "Texte",
    textOnly: "Réponse libre uniquement",
    mixed: "Mixte",
    mixedHint: "Alternance QCM / Texte",
    hostOnlyConfig: "Seul le host peut modifier ces réglages.",
    sourceModeLabel: "Mode source",
    playlist: "Playlist",
    noPlaylist: "Aucune playlist sélectionnée",
    difficulty: "Difficulté",
    readyToggleOn: "Je suis prêt",
    readyToggleOff: "Je ne suis plus prêt",
    starting: "Lancement...",
    startGame: "Lancer la partie",
    playersReady: "Joueurs prêts",
    player: "Joueur",
    host: "Host",
    readyStatus: "Prêt",
    waitingStatus: "En attente",
    kick: "Éjecter",
    eliminated: "Éliminé",
    spectator: "Spectateur",
    off: "Désactivé",
    openingsShort: "OP uniquement",
    endingsShort: "ED uniquement",
    revealArtworkAlt: "illustration",
    spectatorHint: "Le mode spectateur est actif. Tu peux suivre la manche sans répondre.",
    answerLabel: "Réponse (titre de l'anime)",
    answerPlaceholder: "Titre de l'anime",
    answerTypePrompt: "Tape un titre d'anime",
    loadingAnime: "Chargement des titres d'anime...",
    noSuggestion: "Aucune suggestion",
    answerSent: "Réponse envoyée",
    sending: "Envoi...",
    validate: "Valider",
    waitingOthers: "En attente des autres...",
    validation: "Validation",
    reveal: "Révélation",
    nextVotes: "Votes suivant",
    next: "Suivant",
    skip: "Passer",
    final: "Final",
    finalPodium: "Podium final",
    noPlayer: "Aucun joueur",
    leaveRoom: "Quitter la room",
    backLobby: "Retour au lobby...",
    replay: "Rejouer",
    hostCanReplay: "Le host peut renvoyer tout le monde au lobby.",
    chat: "Chat",
    noMessage: "Aucun message pour le moment.",
    message: "Message",
    messagePlaceholder: "Écris dans la room...",
    send: "Envoyer",
    roomLeft: "Tu as quitté la room.",
    sourceModeUpdated: "Mode source",
    themeModeUpdated: "Mode de thèmes",
    configUpdateError: "Impossible de mettre à jour les réglages.",
    answerModeUpdated: "Mode de réponse",
    answerModeError: "Impossible de changer le mode de réponse.",
    difficultyUpdated: "Difficulté",
    contentFiltersUpdated: "Filtres mis à jour.",
    contentFiltersError: "Impossible de mettre à jour les filtres.",
    livesModeError: "Impossible de changer le mode vies.",
    publicPlaylistUpdated: "Playlist publique",
    youAreReady: "Tu es prêt.",
    noLongerReady: "Tu n'es plus prêt.",
    playerKicked: "Joueur éjecté.",
    returnedLobby: "Retour au lobby.",
    settingsRestored: "Réglages précédents restaurés.",
    settingsRestoreError: "Impossible de restaurer les réglages précédents.",
    playbackUnavailable: "Erreur audio : extrait indisponible.",
    themeLoadingLong: "Le chargement du thème prend plus de temps que prévu...",
    themeLoadingRetry: "Le thème charge toujours. Nouvelle tentative...",
  },
} satisfies LocalizedCopy<Record<string, string>>;

export function getRoomCopy(locale: SupportedLocale) {
  return pickCopy(roomCopy, locale);
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : null;
}

export function roomMissingMessage(locale: SupportedLocale) {
  return locale === "en"
    ? "This room is no longer available."
    : "Cette room n'est plus disponible.";
}

function playerSessionExpiredMessage(locale: SupportedLocale) {
  return locale === "en"
    ? "Your player session expired. Join the room again."
    : "Ta session joueur a expiré. Rejoins la room.";
}

function hostOnlyMessage(actionFr: string, actionEn: string, locale: SupportedLocale) {
  return locale === "en" ? `Only the host can ${actionEn}.` : `Seul le host peut ${actionFr}.`;
}

export function sourceModeLabel(mode: SourceMode, locale: SupportedLocale) {
  if (mode === "anilist_union") return locale === "en" ? "Synced AniList" : "AniList synchronisé";
  if (mode === "random_classic") {
    return locale === "en" ? "Classic random anime blind test" : "Blind test anime aléatoire classique";
  }
  if (mode === "players_liked") {
    return locale === "en" ? "Players' liked songs" : "Titres likés des joueurs";
  }
  return locale === "en" ? "Public playlist" : "Playlist publique";
}

export function themeModeLabel(mode: ThemeMode, locale: SupportedLocale) {
  if (mode === "op_only") return locale === "en" ? "OP only" : "OP uniquement";
  if (mode === "ed_only") return locale === "en" ? "ED only" : "ED uniquement";
  return locale === "en" ? "Mixed" : "Mixte";
}

export function difficultyFilterLabel(filter: DifficultyFilter, locale: SupportedLocale) {
  if (filter === "easy") return locale === "en" ? "Easy" : "Facile";
  if (filter === "medium") return locale === "en" ? "Medium" : "Moyen";
  if (filter === "hard") return locale === "en" ? "Hard" : "Difficile";
  return locale === "en" ? "All" : "Tous";
}

export function contentDecadesLabel(filters: RoomContentFilters, locale: SupportedLocale) {
  if (filters.decades.length <= 0) return locale === "en" ? "All" : "Toutes";
  return CONTENT_FILTER_DECADES.filter((entry) => filters.decades.includes(entry.start))
    .map((entry) => entry.label)
    .join(", ");
}

export function contentGenresLabel(filters: RoomContentFilters, locale: SupportedLocale) {
  if (filters.genres.length <= 0) return locale === "en" ? "All" : "Tous";
  return filters.genres.join(", ");
}

export function livesPresetLabel(preset: number, locale: SupportedLocale) {
  if (preset <= 0) return locale === "en" ? "Off" : "Désactivé";
  return preset === 1
    ? locale === "en"
      ? "1 life"
      : "1 vie"
    : locale === "en"
      ? `${preset} lives`
      : `${preset} vies`;
}

export function snapshotErrorMessage(error: unknown, locale: SupportedLocale) {
  if (errorCode(error) === "ROOM_NOT_FOUND") {
    return roomMissingMessage(locale);
  }
  return locale === "en" ? "Unable to synchronize." : "Impossible de synchroniser la room.";
}

export function startErrorMessage(
  error: unknown,
  spotifyCooldownRemainingSec: number,
  locale: SupportedLocale,
) {
  switch (errorCode(error)) {
    case "ANILIST_REMOTE_FAILURE":
      return locale === "en"
        ? "AniList is temporarily unavailable for this random mode. Try again in a few seconds."
        : "AniList est temporairement indisponible pour ce mode aléatoire. Réessaie dans quelques secondes.";
    case "NO_TRACKS_FOUND":
      return locale === "en"
        ? "No playable track was found right now. Try again in a few seconds."
        : "Aucun extrait jouable n'a été trouvé pour le moment. Réessaie dans quelques secondes.";
    case "SPOTIFY_RATE_LIMITED":
      return locale === "en"
        ? `Spotify is rate-limiting requests. Try again in ${spotifyCooldownRemainingSec}s.`
        : `Spotify limite temporairement les requêtes. Réessaie dans ${spotifyCooldownRemainingSec}s.`;
    case "SOURCE_NOT_SET":
      return locale === "en"
        ? "The host must choose a playlist before starting."
        : "Le host doit choisir une playlist avant de lancer.";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "PLAYERS_LIBRARY_NOT_READY":
      return locale === "en"
        ? "AniList mode requires at least one player with a synced AniList library."
        : "Le mode AniList nécessite au moins un joueur avec une bibliothèque AniList synchronisée.";
    case "HOST_ONLY":
      return hostOnlyMessage("lancer la partie", "start the game", locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en" ? "Unable to start the game." : "Impossible de lancer la partie.";
  }
}

export function sourceModeErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("changer le mode source", "change the source mode", locale);
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to update the source mode."
        : "Impossible de mettre à jour le mode source.";
  }
}

export function themeModeErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("changer le mode de thèmes", "change the theme mode", locale);
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to update the theme mode."
        : "Impossible de mettre à jour le mode de thèmes.";
  }
}

export function difficultyFilterErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("changer la difficulté", "change the difficulty", locale);
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to update the difficulty."
        : "Impossible de mettre à jour la difficulté.";
  }
}

export function publicPlaylistErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("choisir la playlist publique", "choose the public playlist", locale);
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to update the public playlist."
        : "Impossible de mettre à jour la playlist publique.";
  }
}

export function readyErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "INVALID_STATE":
      return locale === "en"
        ? "Ready status can only be changed in the lobby."
        : "Le statut prêt peut seulement changer dans le lobby.";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to update your status."
        : "Impossible de mettre à jour ton statut.";
  }
}

export function kickErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("éjecter un joueur", "kick a player", locale);
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to kick this player."
        : "Impossible d'éjecter ce joueur.";
  }
}

export function replayErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "HOST_ONLY":
      return hostOnlyMessage("relancer une partie", "restart a game", locale);
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to return to the lobby."
        : "Impossible de revenir au lobby.";
  }
}

export function skipErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "INVALID_STATE":
      return locale === "en"
        ? "Skip/Next voting is not available in this state."
        : "Le vote Passer/Suivant n'est pas disponible dans cet état.";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to record your vote right now."
        : "Impossible d'enregistrer ton vote pour le moment.";
  }
}

export function chatErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en"
        ? "Unable to send the message."
        : "Impossible d'envoyer le message.";
  }
}

export function roomPhaseLabel(phase: string | undefined, locale: SupportedLocale) {
  switch (phase) {
    case "waiting":
      return locale === "en" ? "Lobby" : "Lobby";
    case "countdown":
      return locale === "en" ? "Countdown" : "Compte à rebours";
    case "loading":
      return locale === "en" ? "Loading" : "Chargement";
    case "playing":
      return locale === "en" ? "Live round" : "Manche live";
    case "reveal":
      return locale === "en" ? "Reveal" : "Révélation";
    case "leaderboard":
      return locale === "en" ? "Leaderboard" : "Classement";
    case "results":
      return locale === "en" ? "Results" : "Résultats";
    default:
      return locale === "en" ? "Room" : "Room";
  }
}

export function answerErrorMessage(error: unknown, locale: SupportedLocale) {
  switch (errorCode(error)) {
    case "ANSWER_NOT_ACCEPTED":
      return locale === "en"
        ? "Answer not accepted. The round may be over or already locked."
        : "Réponse non prise en compte. La manche est peut-être terminée ou déjà verrouillée.";
    case "PLAYER_NOT_FOUND":
      return playerSessionExpiredMessage(locale);
    case "ROOM_NOT_FOUND":
      return roomMissingMessage(locale);
    default:
      return locale === "en" ? "Answer rejected." : "Réponse refusée.";
  }
}

export function lobbyReadyStatusLabel(
  state:
    | {
        allReady: boolean;
        canStart: boolean;
        isResolvingTracks: boolean;
        poolBuild: {
          status: "idle" | "building" | "ready" | "failed";
        };
        sourceMode: SourceMode;
        sourceConfig: {
          publicPlaylist: {
            sourceQuery: string;
          } | null;
        };
      }
    | null
    | undefined,
  isHost: boolean,
  hasActivePlayerSeat: boolean,
  locale: SupportedLocale,
) {
  if (!state?.allReady) return "";
  if (!hasActivePlayerSeat) {
    return locale === "en"
      ? " · Your player session is no longer active. Join the room again."
      : " · Ta session joueur n'est plus active. Rejoins la room.";
  }
  if (state.isResolvingTracks) {
    return locale === "en" ? " · Audio sources are being prepared..." : " · Préparation des sources audio...";
  }
  if (!state.canStart) {
    if (state.sourceMode === "public_playlist" && !state.sourceConfig.publicPlaylist?.sourceQuery) {
      return isHost
        ? locale === "en"
          ? " · Choose a playlist to start."
          : " · Choisis une playlist pour lancer."
        : locale === "en"
          ? " · Waiting for the host playlist."
          : " · En attente de la playlist du host.";
    }
    if (state.sourceMode === "players_liked" || state.sourceMode === "anilist_union") {
      return isHost
        ? locale === "en"
          ? " · Add an AniList username and sync before starting."
          : " · Ajoute un pseudo AniList puis synchronise avant de lancer."
        : locale === "en"
          ? " · Waiting for the host setup."
          : " · En attente de la configuration du host.";
    }
    return "";
  }
  if (
    (state.sourceMode === "players_liked" || state.sourceMode === "anilist_union") &&
    state.poolBuild.status !== "ready"
  ) {
    return locale === "en"
      ? " · Preparing the players' playlist..."
      : " · Préparation de la playlist des joueurs...";
  }
  return isHost
    ? locale === "en"
      ? " · Auto-start in progress..."
      : " · Lancement automatique en cours..."
    : locale === "en"
      ? " · Waiting for the host to start."
      : " · En attente du lancement par le host.";
}
