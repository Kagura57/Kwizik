import type { SupportedLocale } from "../locale";
import { pickCopy, type LocalizedCopy } from "./types";

const joinCopy = {
  en: {
    title: "Join a room",
    subtitle: "Enter a code and pick a nickname.",
    roomCode: "Room code",
    nickname: "Nickname",
    nicknamePlaceholder: "Your nickname",
    connecting: "Joining...",
    submit: "Join room",
    publicRooms: "Public rooms",
    players: "players",
    use: "Use code",
    locked: "Unavailable",
    joined: "Room joined.",
  },
  fr: {
    title: "Rejoindre une room",
    subtitle: "Entre un code et choisis un pseudo.",
    roomCode: "Code room",
    nickname: "Pseudo",
    nicknamePlaceholder: "Ton pseudo",
    connecting: "Connexion...",
    submit: "Rejoindre la room",
    publicRooms: "Rooms publiques",
    players: "joueurs",
    use: "Utiliser",
    locked: "Indisponible",
    joined: "Room rejointe.",
  },
} satisfies LocalizedCopy<{
  title: string;
  subtitle: string;
  roomCode: string;
  nickname: string;
  nicknamePlaceholder: string;
  connecting: string;
  submit: string;
  publicRooms: string;
  players: string;
  use: string;
  locked: string;
  joined: string;
}>;

export function getJoinCopy(locale: SupportedLocale) {
  return pickCopy(joinCopy, locale);
}

export function getJoinErrorMessage(error: unknown, locale: SupportedLocale) {
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

export function formatJoinRoomState(state: string, locale: SupportedLocale) {
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
