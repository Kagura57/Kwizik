import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { localizedPath } from "../i18n/locale";
import { usePageSeo } from "../i18n/seo";
import { useCurrentLocale } from "../i18n/useLocale";
import { HttpStatusError, signInWithEmail, signUpWithEmail } from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

type AuthMode = "signin" | "signup";

function authErrorMessage(error: unknown, mode: AuthMode, locale: "fr" | "en") {
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
      return locale === "en" ? "Password is too short." : "Le mot de passe est trop court.";
    }
    if (error.message === "Email and password is not enabled") {
      return locale === "en"
        ? "Email/password authentication is disabled on the server."
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
      : "Connexion impossible pour le moment."
    : locale === "en"
      ? "Unable to sign up right now."
      : "Inscription impossible pour le moment.";
}

export function AuthPage() {
  const queryClient = useQueryClient();
  const locale = useCurrentLocale();
  const account = useGameStore((state) => state.account);
  const setAccount = useGameStore((state) => state.setAccount);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const locationSearch = useRouterState({
    select: (state) => state.location.searchStr,
  });

  const redirectTarget = useMemo(() => {
    if (!locationSearch) return localizedPath(locale, "/settings");
    const value = new URLSearchParams(locationSearch).get("returnTo");
    if (!value) return localizedPath(locale, "/settings");
    if (!value.startsWith("/")) return localizedPath(locale, "/settings");
    return value.startsWith("/fr") || value.startsWith("/en")
      ? value
      : localizedPath(locale, value);
  }, [locale, locationSearch]);
  const copy =
    locale === "en"
      ? {
          title: "Kwizik account",
          subtitle: "Sign in to link your AniList account, sync your library, and manage your profile.",
          connectedAs: "Signed in as",
          openSettings: "Open settings",
          backHome: "Back home",
          signin: "Sign in",
          signinDescription: "Access your existing account",
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
          submitSignup: "Create my account",
          userFallback: "User",
        }
      : {
          title: "Compte Kwizik",
          subtitle: "Connecte-toi pour lier ton compte AniList, synchroniser ta liste et gerer ton profil.",
          connectedAs: "Connecté en tant que",
          openSettings: "Ouvrir mes paramètres",
          backHome: "Retour accueil",
          signin: "Connexion",
          signinDescription: "Accéder à ton compte existant",
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
          submitSignup: "Créer mon compte",
          userFallback: "Utilisateur",
        };
  usePageSeo({
    title: locale === "en" ? "Kwizik account" : "Compte Kwizik",
    description:
      locale === "en"
        ? "Sign in to sync AniList and manage your Kwizik profile."
        : "Connecte-toi pour synchroniser AniList et gerer ton profil Kwizik.",
    locale,
    path: "/auth",
    noindex: true,
  });

  const authMutation = useMutation({
    mutationFn: async () => {
      if (mode === "signin") {
        return await signInWithEmail({
          email: email.trim(),
          password,
          rememberMe,
        });
      }

      return await signUpWithEmail({
        name: name.trim(),
        email: email.trim(),
        password,
        rememberMe,
      });
    },
    onSuccess: async (payload) => {
      setAccount({
        userId: payload.user.id,
        name: payload.user.name,
        email: payload.user.email,
      });
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      window.location.assign(redirectTarget);
    },
    onError: (error) => {
      notify.error(authErrorMessage(error, mode, locale), {
        key: `auth:${mode}:error`,
      });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authMutation.isPending) return;
    if (email.trim().length <= 0 || password.trim().length <= 0) return;
    if (mode === "signup" && name.trim().length <= 0) return;
    authMutation.mutate();
  }

  return (
    <section className="single-panel">
      <article className="panel-card">
        <h2 className="panel-title">{copy.title}</h2>
        <p className="panel-copy">{copy.subtitle}</p>

        {account.userId ? (
          <div className="panel-form">
            <p className="status">
              {copy.connectedAs} {account.name ?? account.email ?? copy.userFallback}.
            </p>
            <div className="waiting-actions">
              <Link className="solid-btn" to={localizedPath(locale, "/settings")}>
                {copy.openSettings}
              </Link>
              <Link className="ghost-btn" to={localizedPath(locale, "/")}>
                {copy.backHome}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="source-preset-grid">
              <button
                type="button"
                className={`source-preset-btn${mode === "signin" ? " active" : ""}`}
                onClick={() => setMode("signin")}
              >
                <strong>{copy.signin}</strong>
                <span>{copy.signinDescription}</span>
              </button>
              <button
                type="button"
                className={`source-preset-btn${mode === "signup" ? " active" : ""}`}
                onClick={() => setMode("signup")}
              >
                <strong>{copy.signup}</strong>
                <span>{copy.signupDescription}</span>
              </button>
            </div>

            <form className="panel-form" onSubmit={onSubmit}>
              {mode === "signup" && (
                <label>
                  <span>{copy.name}</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    maxLength={60}
                    placeholder={copy.namePlaceholder}
                  />
                </label>
              )}

              <label>
                <span>{copy.email}</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>

              <label>
                <span>{copy.password}</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="••••••••"
                />
              </label>

              {mode === "signin" && (
                <label className="remember-toggle">
                  <input
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span className="remember-toggle-ui" aria-hidden="true" />
                  <span>{copy.rememberMe}</span>
                </label>
              )}

              <button className="solid-btn" type="submit" disabled={authMutation.isPending}>
                {authMutation.isPending
                  ? mode === "signin"
                    ? copy.signingIn
                    : copy.signingUp
                  : mode === "signin"
                    ? copy.submitSignin
                    : copy.submitSignup}
              </button>
            </form>
          </>
        )}
      </article>
    </section>
  );
}
