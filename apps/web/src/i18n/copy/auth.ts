import type { SupportedLocale } from "../locale";
import { HttpStatusError } from "../../lib/api";
import { pickCopy, type LocalizedCopy } from "./types";

type AuthMode = "signin" | "signup";

const authCopy = {
  en: {
    title: "Kwizik account",
    subtitle: "Sign in to sync AniList and manage your profile.",
    connectedAs: "Signed in as",
    openSettings: "Open settings",
    backHome: "Back home",
    signin: "Sign in",
    signinDescription: "Use your existing account",
    signup: "Sign up",
    signupDescription: "Create a new account",
    name: "Name",
    namePlaceholder: "Your nickname",
    email: "Email",
    password: "Password",
    rememberMe: "Keep me signed in",
    signingIn: "Signing in...",
    signingUp: "Signing up...",
    submitSignin: "Sign in",
    submitSignup: "Create account",
    userFallback: "User",
  },
  fr: {
    title: "Compte Kwizik",
    subtitle: "Connecte-toi pour synchroniser AniList et gérer ton profil.",
    connectedAs: "Connecté en tant que",
    openSettings: "Ouvrir les paramètres",
    backHome: "Retour à l'accueil",
    signin: "Connexion",
    signinDescription: "Utiliser ton compte existant",
    signup: "Inscription",
    signupDescription: "Créer un nouveau compte",
    name: "Nom",
    namePlaceholder: "Ton pseudo",
    email: "Email",
    password: "Mot de passe",
    rememberMe: "Rester connecté",
    signingIn: "Connexion...",
    signingUp: "Inscription...",
    submitSignin: "Se connecter",
    submitSignup: "Créer un compte",
    userFallback: "Utilisateur",
  },
} satisfies LocalizedCopy<{
  title: string;
  subtitle: string;
  connectedAs: string;
  openSettings: string;
  backHome: string;
  signin: string;
  signinDescription: string;
  signup: string;
  signupDescription: string;
  name: string;
  namePlaceholder: string;
  email: string;
  password: string;
  rememberMe: string;
  signingIn: string;
  signingUp: string;
  submitSignin: string;
  submitSignup: string;
  userFallback: string;
}>;

export function getAuthCopy(locale: SupportedLocale) {
  return pickCopy(authCopy, locale);
}

export function getAuthErrorMessage(error: unknown, mode: AuthMode, locale: SupportedLocale) {
  if (error instanceof HttpStatusError) {
    if (error.message === "Invalid email or password" || error.status === 401) {
      return locale === "en" ? "Invalid email or password." : "Email ou mot de passe invalide.";
    }
    if (
      error.message === "User already exists" ||
      error.message === "User already exists. Use another email"
    ) {
      return locale === "en"
        ? "An account already exists for this email."
        : "Un compte existe déjà avec cet email.";
    }
    if (error.message === "Password too short") {
      return locale === "en"
        ? "Password is too short."
        : "Le mot de passe est trop court.";
    }
    if (error.message === "Email and password is not enabled") {
      return locale === "en"
        ? "Email/password sign-in is disabled on the server."
        : "La connexion email/mot de passe est désactivée côté serveur.";
    }
    return error.message;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return mode === "signin"
    ? locale === "en"
      ? "Unable to sign in right now."
      : "Impossible de se connecter pour le moment."
    : locale === "en"
      ? "Unable to sign up right now."
      : "Impossible de s'inscrire pour le moment.";
}
