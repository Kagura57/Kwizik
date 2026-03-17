import type { SupportedLocale } from "../locale";
import { pickCopy, type LocalizedCopy } from "./types";

const rootCopy = {
  en: {
    home: "Home",
    settings: "Settings",
    signIn: "Sign in",
    signOut: "Sign out",
    signingOut: "Signing out...",
    signOutSuccess: "Signed out.",
    signOutError: "Unable to sign out right now.",
    subtitle: "Anime blind test, live",
    meta: "Create a room, join with a code, and play in sync.",
    languageLabel: "FR",
    notifications: "Notifications",
  },
  fr: {
    home: "Accueil",
    settings: "Paramètres",
    signIn: "Connexion",
    signOut: "Déconnexion",
    signingOut: "Déconnexion...",
    signOutSuccess: "Déconnexion effectuée.",
    signOutError: "Impossible de te déconnecter pour le moment.",
    subtitle: "Blind test anime en direct",
    meta: "Crée une room, rejoins avec un code et joue en synchro.",
    languageLabel: "EN",
    notifications: "Notifications",
  },
} satisfies LocalizedCopy<{
  home: string;
  settings: string;
  signIn: string;
  signOut: string;
  signingOut: string;
  signOutSuccess: string;
  signOutError: string;
  subtitle: string;
  meta: string;
  languageLabel: string;
  notifications: string;
}>;

export function getRootCopy(locale: SupportedLocale) {
  return pickCopy(rootCopy, locale);
}
