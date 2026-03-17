import type { SupportedLocale } from "../locale";
import { pickCopy, type LocalizedCopy } from "./types";

const homeCopy = {
  en: {
    joinTitle: "Join a room",
    joinSubtitle: "Enter a code and pick a nickname.",
    roomCode: "Room code",
    nickname: "Nickname",
    nicknamePlaceholder: "Your nickname",
    joining: "Joining...",
    enterRoom: "Join room",
    createTitle: "Create a room",
    createSubtitle: "Open a lobby in one click, choose its visibility, then finish setup from the room.",
    syncHint: "Tip: sign in and add your AniList username in Settings to sync your anime library.",
    visibility: "Visibility",
    publicGame: "Public room",
    publicGameHint: "Visible in the public list",
    privateGame: "Private room",
    privateGameHint: "Only accessible with the room code",
    hostHint: "The host sets the source, theme mode, and rules before starting.",
    creating: "Creating...",
    createRoom: "Create room",
    publicRooms: "Public rooms",
    players: "players",
    mode: "Mode",
    synchronizedAniList: "Synced AniList",
    anime: "Anime",
    joinPublicRoom: "Join",
    closed: "Closed",
    roomCreated: "Room created.",
    roomJoined: "Room joined.",
    createError: "Unable to create the room.",
    promptNickname: "Choose a nickname to join this room.",
    heroKicker: "Anime multiplayer",
    heroTitle: "Anime blind test rooms, ready in seconds",
    heroBody: "Open a room, invite friends with one code, and play openings and endings live in the browser.",
    heroActionPrimary: "Create a room",
    heroActionSecondary: "Join with a code",
    heroFeatureOneTitle: "Shared playback",
    heroFeatureOneBody: "Everyone hears the same round at the same time.",
    heroFeatureTwoTitle: "Public or private",
    heroFeatureTwoBody: "Open the room to everyone or keep it for your group.",
    heroFeatureThreeTitle: "AniList sync",
    heroFeatureThreeBody: "Use synced libraries when you want a sharper anime pool.",
    heroSignalRooms: "Public rooms",
    heroSignalJoinable: "Open now",
    heroSignalModes: "Modes",
    heroSignalModesValue: "Anime + AniList",
    heroSignalAccess: "Access",
    heroSignalAccessValue: "Browser only",
    consoleKicker: "Lobby console",
    actionTitle: "Create or join a room",
    actionSubtitle: "Use one panel to jump into a live lobby or open your own.",
    joinBlockTitle: "Join room",
    createBlockTitle: "Create room",
    joinModeHint: "Enter a room code and a nickname. The first player in becomes host.",
    createModeHint: "Open a room, choose whether it is public, then finish setup in the lobby.",
    joinModeMeta: "Best when you already have a code.",
    createModeMeta: "Best when you want to host.",
    publicRoomsTitle: "Rooms you can join now",
    publicRoomsSubtitle: "Live public lobbies with enough detail to choose quickly.",
    publicRoomsCount: "listed rooms",
    publicRoomsEmpty: "No public rooms are open right now. Create one to get started.",
    publicRoomsKicker: "Live room feed",
    seoH1: "Anime Blind Test Online for Multiplayer Rooms",
    seoLead: "Create a live anime blind test room, invite friends, and play openings and endings together in the browser.",
    howItWorksTitle: "How Kwizik works",
    howItWorksBody: "Create a room, choose the anime source, invite players with a short code, then start a live blind test with shared playback and live scoring.",
    whyTitle: "Why anime fans use Kwizik",
    whyBody: "Kwizik combines public rooms, private lobbies, AniList-based pools, and live multiplayer gameplay for anime quiz sessions with friends or communities.",
    faqTitle: "FAQ",
    faqQ1: "Can I play an anime blind test online with friends?",
    faqA1: "Yes. Create a room, share the code, and everyone can join from the browser before the host starts.",
    faqQ2: "Does Kwizik support anime openings and endings?",
    faqA2: "Yes. Hosts can play openings only, endings only, or a mix of both.",
  },
  fr: {
    joinTitle: "Rejoindre une room",
    joinSubtitle: "Entre un code et choisis un pseudo.",
    roomCode: "Code room",
    nickname: "Pseudo",
    nicknamePlaceholder: "Ton pseudo",
    joining: "Connexion...",
    enterRoom: "Rejoindre la room",
    createTitle: "Créer une room",
    createSubtitle: "Ouvre un lobby en un clic, choisis sa visibilité, puis termine la configuration dans la room.",
    syncHint: "Astuce : connecte-toi puis ajoute ton pseudo AniList dans les paramètres pour synchroniser ta bibliothèque anime.",
    visibility: "Visibilité",
    publicGame: "Room publique",
    publicGameHint: "Visible dans la liste publique",
    privateGame: "Room privée",
    privateGameHint: "Accessible uniquement avec le code room",
    hostHint: "Le host règle la source, le mode de thèmes et les règles avant de lancer.",
    creating: "Création...",
    createRoom: "Créer la room",
    publicRooms: "Rooms publiques",
    players: "joueurs",
    mode: "Mode",
    synchronizedAniList: "AniList synchronisé",
    anime: "Anime",
    joinPublicRoom: "Rejoindre",
    closed: "Fermée",
    roomCreated: "Room créée.",
    roomJoined: "Room rejointe.",
    createError: "Impossible de créer la room.",
    promptNickname: "Choisis un pseudo pour rejoindre cette room.",
    heroKicker: "Anime multijoueur",
    heroTitle: "Des rooms de blind test anime prêtes en quelques secondes",
    heroBody: "Ouvre une room, invite tes amis avec un code, puis joue des openings et endings en direct dans le navigateur.",
    heroActionPrimary: "Créer une room",
    heroActionSecondary: "Rejoindre avec un code",
    heroFeatureOneTitle: "Lecture partagée",
    heroFeatureOneBody: "Tout le monde entend la même manche au même moment.",
    heroFeatureTwoTitle: "Publique ou privée",
    heroFeatureTwoBody: "Ouvre la room à tous ou garde-la pour ton groupe.",
    heroFeatureThreeTitle: "Sync AniList",
    heroFeatureThreeBody: "Utilise les bibliothèques synchronisées pour un pool plus précis.",
    heroSignalRooms: "Rooms publiques",
    heroSignalJoinable: "Ouvertes",
    heroSignalModes: "Modes",
    heroSignalModesValue: "Anime + AniList",
    heroSignalAccess: "Accès",
    heroSignalAccessValue: "Navigateur uniquement",
    consoleKicker: "Console de lobby",
    actionTitle: "Créer ou rejoindre une room",
    actionSubtitle: "Un seul panneau pour rejoindre un lobby ou ouvrir le tien.",
    joinBlockTitle: "Rejoindre",
    createBlockTitle: "Créer",
    joinModeHint: "Entre un code room et un pseudo. Le premier joueur devient host.",
    createModeHint: "Ouvre une room, choisis si elle est publique, puis termine la configuration dans le lobby.",
    joinModeMeta: "Le plus simple si tu as déjà le code.",
    createModeMeta: "Le bon choix si tu veux host la partie.",
    publicRoomsTitle: "Rooms disponibles maintenant",
    publicRoomsSubtitle: "Des lobbies publics en direct, avec juste assez d'infos pour choisir vite.",
    publicRoomsCount: "rooms listées",
    publicRoomsEmpty: "Aucune room publique n'est ouverte pour le moment. Crée-en une pour commencer.",
    publicRoomsKicker: "Flux des rooms live",
    seoH1: "Blind test anime en ligne pour jouer en multijoueur",
    seoLead: "Crée une room de blind test anime, invite tes amis et joue des openings et endings ensemble dans le navigateur.",
    howItWorksTitle: "Comment fonctionne Kwizik",
    howItWorksBody: "Crée une room, choisis la source anime, invite les joueurs avec un code court, puis lance un blind test en direct avec lecture partagée et score live.",
    whyTitle: "Pourquoi utiliser Kwizik",
    whyBody: "Kwizik combine rooms publiques, lobbies privés, pools AniList et gameplay multijoueur en direct pour les quiz anime entre amis ou en communauté.",
    faqTitle: "FAQ",
    faqQ1: "Peut-on jouer à un blind test anime en ligne avec des amis ?",
    faqA1: "Oui. Crée une room, partage le code, puis tout le monde rejoint depuis le navigateur avant le lancement.",
    faqQ2: "Kwizik gère-t-il les openings et endings d'anime ?",
    faqA2: "Oui. Le host peut jouer uniquement les openings, uniquement les endings, ou un mix des deux.",
  },
} satisfies LocalizedCopy<{
  joinTitle: string;
  joinSubtitle: string;
  roomCode: string;
  nickname: string;
  nicknamePlaceholder: string;
  joining: string;
  enterRoom: string;
  createTitle: string;
  createSubtitle: string;
  syncHint: string;
  visibility: string;
  publicGame: string;
  publicGameHint: string;
  privateGame: string;
  privateGameHint: string;
  hostHint: string;
  creating: string;
  createRoom: string;
  publicRooms: string;
  players: string;
  mode: string;
  synchronizedAniList: string;
  anime: string;
  joinPublicRoom: string;
  closed: string;
  roomCreated: string;
  roomJoined: string;
  createError: string;
  promptNickname: string;
  heroKicker: string;
  heroTitle: string;
  heroBody: string;
  heroActionPrimary: string;
  heroActionSecondary: string;
  heroFeatureOneTitle: string;
  heroFeatureOneBody: string;
  heroFeatureTwoTitle: string;
  heroFeatureTwoBody: string;
  heroFeatureThreeTitle: string;
  heroFeatureThreeBody: string;
  heroSignalRooms: string;
  heroSignalJoinable: string;
  heroSignalModes: string;
  heroSignalModesValue: string;
  heroSignalAccess: string;
  heroSignalAccessValue: string;
  consoleKicker: string;
  actionTitle: string;
  actionSubtitle: string;
  joinBlockTitle: string;
  createBlockTitle: string;
  joinModeHint: string;
  createModeHint: string;
  joinModeMeta: string;
  createModeMeta: string;
  publicRoomsTitle: string;
  publicRoomsSubtitle: string;
  publicRoomsCount: string;
  publicRoomsEmpty: string;
  publicRoomsKicker: string;
  seoH1: string;
  seoLead: string;
  howItWorksTitle: string;
  howItWorksBody: string;
  whyTitle: string;
  whyBody: string;
  faqTitle: string;
  faqQ1: string;
  faqA1: string;
  faqQ2: string;
  faqA2: string;
}>;

export function getHomeCopy(locale: SupportedLocale) {
  return pickCopy(homeCopy, locale);
}

export function getHomeJoinErrorMessage(error: unknown, locale: SupportedLocale) {
  if (!(error instanceof Error)) {
    return locale === "en" ? "Unable to join this room." : "Impossible de rejoindre la room.";
  }
  if (error.message === "ROOM_NOT_JOINABLE") {
    return locale === "en"
      ? "This room is finished and no longer accepts new players."
      : "La room est terminée et n'accepte plus de nouveaux joueurs.";
  }
  return locale === "en" ? "Unable to join this room." : "Impossible de rejoindre la room.";
}

export function formatHomeRoomState(state: string, locale: SupportedLocale) {
  switch (state) {
    case "waiting":
      return locale === "en" ? "Lobby open" : "Lobby ouvert";
    case "playing":
      return locale === "en" ? "Live match" : "Partie en cours";
    case "results":
      return locale === "en" ? "Results" : "Résultats";
    case "finished":
      return locale === "en" ? "Finished" : "Terminée";
    default:
      return state;
  }
}
