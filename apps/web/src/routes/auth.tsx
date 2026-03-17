import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { getAuthCopy, getAuthErrorMessage } from "../i18n/copy/auth";
import { localizedPath } from "../i18n/locale";
import { usePageSeo } from "../i18n/seo";
import { useCurrentLocale } from "../i18n/useLocale";
import { signInWithEmail, signUpWithEmail } from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

type AuthMode = "signin" | "signup";

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
  const copy = getAuthCopy(locale);
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
      notify.error(getAuthErrorMessage(error, mode, locale), {
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
