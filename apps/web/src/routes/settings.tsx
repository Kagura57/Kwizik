import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { localizedPath } from "../i18n/locale";
import { usePageSeo } from "../i18n/seo";
import { useCurrentLocale } from "../i18n/useLocale";
import {
  getAccountTitlePreference,
  getAniListRecoveredLibrary,
  getAniListLibrarySyncStatus,
  getAniListLinkStatus,
  getAuthSession,
  HttpStatusError,
  queueAniListLibrarySync,
  signOutAccount,
  type TitlePreference,
  updateAccountTitlePreference,
  updateAniListUsername,
} from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

type AniListLinkStatus = "linked" | "not_linked";

function anilistStatusMeta(status: AniListLinkStatus, locale: "fr" | "en") {
  if (status === "linked") {
    return {
      label: locale === "en" ? "Ready" : "Pret",
      tone: "connected",
      description:
        locale === "en"
          ? "AniList username configured for anime rounds."
          : "Pseudo AniList configure pour les manches anime.",
    } as const;
  }
  return {
    label: locale === "en" ? "Not configured" : "Non configure",
    tone: "idle",
    description:
      locale === "en"
        ? "Enter your AniList username, then click Update."
        : "Renseigne ton pseudo AniList puis clique Mettre a jour.",
  } as const;
}

function syncStatusLabel(status: "queued" | "running" | "success" | "error" | "idle", locale: "fr" | "en") {
  if (status === "queued") return locale === "en" ? "queued" : "en file";
  if (status === "running") return locale === "en" ? "running" : "en cours";
  if (status === "success") return locale === "en" ? "completed" : "terminee";
  if (status === "error") return locale === "en" ? "error" : "en erreur";
  return "idle";
}

function syncErrorMessage(code: string | null | undefined, locale: "fr" | "en") {
  const normalized = typeof code === "string" ? code.trim() : "";
  if (!normalized) return locale === "en" ? "AniList sync error." : "Erreur de synchronisation AniList.";
  if (normalized === "ANILIST_USERNAME_NOT_SET") {
    return locale === "en"
      ? "Enter your AniList username before syncing."
      : "Renseigne ton pseudo AniList avant de synchroniser.";
  }
  if (normalized === "ANILIST_USER_NOT_FOUND") {
    return locale === "en"
      ? "AniList username not found. Check it and try again."
      : "Pseudo AniList introuvable. Verifie le nom puis relance.";
  }
  if (normalized === "ANILIST_COLLECTION_GRAPHQL_ERROR") {
    return locale === "en"
      ? "AniList returned a GraphQL error. Try again in a few seconds."
      : "AniList a retourne une erreur GraphQL. Reessaie dans quelques secondes.";
  }
  if (normalized === "ANIME_CATALOG_EMPTY") {
    return locale === "en"
      ? "The local anime catalog is empty. Let the API finish refreshing AnimeThemes, then try again."
      : "Le catalogue anime local est vide. Laisse l'API finir son rafraichissement AnimeThemes puis relance.";
  }
  if (normalized.startsWith("ANILIST_COLLECTION_HTTP_")) {
    return locale === "en"
      ? `AniList returned ${normalized.replace("ANILIST_COLLECTION_HTTP_", "HTTP ")}. Try again in a few seconds.`
      : `AniList a retourne ${normalized.replace("ANILIST_COLLECTION_HTTP_", "HTTP ")}. Reessaie dans quelques secondes.`;
  }
  if (normalized === "QUEUE_UNAVAILABLE" || normalized === "ENQUEUE_FAILED") {
    return locale === "en"
      ? "The sync queue is currently unavailable."
      : "La file de synchronisation est indisponible pour le moment.";
  }
  return locale === "en" ? `AniList sync error: ${normalized}` : `Erreur sync AniList: ${normalized}`;
}

function updateMutationErrorMessage(error: unknown, locale: "fr" | "en") {
  if (!(error instanceof HttpStatusError)) {
    return locale === "en"
      ? "Unable to update the AniList library."
      : "Impossible de mettre a jour la liste AniList.";
  }
  if (error.message === "INVALID_ANILIST_USERNAME") {
    return locale === "en"
      ? "Invalid AniList username (letters, digits, _ or - only)."
      : "Pseudo AniList invalide (lettres, chiffres, _ ou - uniquement).";
  }
  if (error.message === "ANILIST_USERNAME_NOT_SET") {
    return locale === "en"
      ? "Enter your AniList username before updating."
      : "Renseigne ton pseudo AniList avant la mise a jour.";
  }
  if (error.message === "QUEUE_UNAVAILABLE" || error.message === "ENQUEUE_FAILED") {
    return locale === "en"
      ? "Username saved, but the sync queue is unavailable."
      : "Pseudo enregistre, mais la file de sync est indisponible.";
  }
  return locale === "en"
    ? "Unable to update the AniList library."
    : "Impossible de mettre a jour la liste AniList.";
}

function formatSyncTimestamp(ts: number | null | undefined, locale: "fr" | "en") {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return locale === "en" ? "never" : "jamais";
  }
  return new Date(ts).toLocaleString(locale === "en" ? "en-US" : "fr-FR");
}

export function SettingsPage() {
  const navigate = useNavigate();
  const locale = useCurrentLocale();
  const queryClient = useQueryClient();
  const setAccount = useGameStore((state) => state.setAccount);
  const clearAccount = useGameStore((state) => state.clearAccount);
  const [anilistUsernameInput, setAniListUsernameInput] = useState("");
  const [usernameDirty, setUsernameDirty] = useState(false);
  usePageSeo({
    title: locale === "en" ? "Kwizik settings" : "Parametres Kwizik",
    description:
      locale === "en"
        ? "Manage your AniList sync and profile preferences in Kwizik."
        : "Gere ta synchronisation AniList et tes preferences de profil dans Kwizik.",
    locale,
    path: "/settings",
    noindex: true,
  });
  const copy =
    locale === "en"
      ? {
          title: "Profile & connections",
          subtitle: "Enter your AniList username, then click Update whenever you want to refresh your library.",
          authRequired: "You must be signed in to manage your AniList username.",
          signIn: "Sign in",
          backHome: "Back home",
          loadingAccount: "Loading account...",
          connected: "Signed in:",
          aniListUsername: "AniList username",
          update: "Update",
          updating: "Updating...",
          lastSync: "Last sync",
          titlePreference: "Title preference",
          titlePreferenceHint: "Choose the displayed format for anime MCQ choices.",
          mixed: "Mixed",
          romaji: "Romaji",
          english: "English",
          syncState: "Sync status",
          progress: "Progress",
          lastRun: "Last run",
          recoveredAnime: "Recovered anime",
          recoveredHint: "Titles present in the locally synced library (watching + completed).",
          loadingLibrary: "Loading anime library...",
          libraryLoadError: "Unable to load the anime library.",
          libraryEmpty: "No anime found yet. Run a sync, then reload this page.",
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
          never: "never",
        }
      : {
          title: "Profil & connexions",
          subtitle: "Renseigne ton pseudo AniList puis clique Mettre a jour quand tu veux rafraichir ta liste.",
          authRequired: "Tu dois etre connecte pour gerer ton pseudo AniList.",
          signIn: "Se connecter",
          backHome: "Retour accueil",
          loadingAccount: "Chargement du compte...",
          connected: "Connecte:",
          aniListUsername: "Pseudo AniList",
          update: "Mettre a jour",
          updating: "Mise a jour...",
          lastSync: "Derniere sync",
          titlePreference: "Preference de titre",
          titlePreferenceHint: "Choisis le format affiche pour les choix QCM anime.",
          mixed: "Mixte",
          romaji: "Romaji",
          english: "Anglais",
          syncState: "Etat synchronisation",
          progress: "Progression",
          lastRun: "Derniere execution",
          recoveredAnime: "Animes recuperes",
          recoveredHint: "Titres presents dans la bibliotheque synchronisee locale (en cours + termines).",
          loadingLibrary: "Chargement de la bibliotheque anime...",
          libraryLoadError: "Impossible de charger la bibliotheque anime.",
          libraryEmpty: "Aucun anime trouve pour le moment. Lance une synchronisation puis recharge cette page.",
          signOut: "Se deconnecter",
          signingOut: "Deconnexion...",
          signedOut: "Déconnexion effectuée.",
          signOutError: "Deconnexion impossible pour le moment.",
          syncStarted: "Pseudo mis à jour et synchronisation AniList lancée.",
          usernameUpdated: "Pseudo AniList mis à jour.",
          titlePreferenceUpdated: "Préférence de titre mise à jour.",
          titlePreferenceError: "Impossible de mettre a jour la preference de titre.",
          accountDescription: "Gere ta synchronisation AniList et tes preferences de profil dans Kwizik.",
          animeQuiz: "Quiz anime",
          statusWatching: "En cours",
          statusCompleted: "Termine",
          never: "jamais",
        };

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: getAuthSession,
    retry: false,
  });

  useEffect(() => {
    if (!sessionQuery.isSuccess) return;
    if (!sessionQuery.data?.user) {
      clearAccount();
      return;
    }
    setAccount({
      userId: sessionQuery.data.user.id,
      name: sessionQuery.data.user.name,
      email: sessionQuery.data.user.email,
    });
  }, [clearAccount, sessionQuery.data, sessionQuery.isSuccess, setAccount]);

  const anilistLinkQuery = useQuery({
    queryKey: ["anilist-link-status"],
    queryFn: getAniListLinkStatus,
    enabled: Boolean(sessionQuery.data?.user),
  });

  const anilistSyncStatusQuery = useQuery({
    queryKey: ["anilist-sync-status"],
    queryFn: getAniListLibrarySyncStatus,
    enabled: Boolean(sessionQuery.data?.user),
    refetchInterval: (query) => {
      const runStatus = query.state.data?.run?.status;
      return runStatus === "queued" || runStatus === "running" ? 2_000 : false;
    },
  });

  const anilistRecoveredLibraryQuery = useQuery({
    queryKey: ["anilist-recovered-library", sessionQuery.data?.user?.id ?? null],
    queryFn: () => getAniListRecoveredLibrary({ limit: 5_000 }),
    enabled: Boolean(sessionQuery.data?.user),
    refetchInterval: () => {
      const runStatus = anilistSyncStatusQuery.data?.run?.status;
      return runStatus === "queued" || runStatus === "running" ? 2_000 : false;
    },
  });

  const titlePreferenceQuery = useQuery({
    queryKey: ["account-title-preference"],
    queryFn: getAccountTitlePreference,
    enabled: Boolean(sessionQuery.data?.user),
  });

  useEffect(() => {
    if (!sessionQuery.data?.user) return;
    if (!titlePreferenceQuery.isSuccess) return;
    setAccount({
      titlePreference: titlePreferenceQuery.data.titlePreference,
    });
  }, [
    sessionQuery.data?.user,
    setAccount,
    titlePreferenceQuery.data?.titlePreference,
    titlePreferenceQuery.isSuccess,
  ]);

  useEffect(() => {
    if (usernameDirty) return;
    const username = anilistLinkQuery.data?.link?.anilistUsername ?? "";
    setAniListUsernameInput(username);
  }, [anilistLinkQuery.data?.link?.anilistUsername, usernameDirty]);

  const updateAndSyncMutation = useMutation({
    mutationFn: async () => {
      const username = anilistUsernameInput.trim();
      await updateAniListUsername({ username });
      if (!username) {
        return { queued: false as const };
      }
      const queued = await queueAniListLibrarySync();
      return {
        queued: true as const,
        runId: queued.runId,
      };
    },
    onSettled: async () => {
      setUsernameDirty(false);
      await anilistLinkQuery.refetch();
      await anilistSyncStatusQuery.refetch();
      await anilistRecoveredLibraryQuery.refetch();
    },
    onSuccess: (result) => {
      notify.success(result.queued ? copy.syncStarted : copy.usernameUpdated);
    },
    onError: (error) => {
      notify.error(updateMutationErrorMessage(error, locale), {
        key: "settings:anilist:update:error",
      });
    },
  });

  const updateTitlePreferenceMutation = useMutation({
    mutationFn: (titlePreference: TitlePreference) =>
      updateAccountTitlePreference({
        titlePreference,
      }),
    onSuccess: (payload) => {
      setAccount({
        titlePreference: payload.titlePreference,
      });
      notify.success(copy.titlePreferenceUpdated);
    },
    onError: () => {
      notify.error(copy.titlePreferenceError, {
        key: "settings:title-preference:error",
      });
    },
    onSettled: async () => {
      await titlePreferenceQuery.refetch();
    },
  });

  const signOutMutation = useMutation({
    mutationFn: signOutAccount,
    onSuccess: async () => {
      clearAccount();
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      await queryClient.invalidateQueries({ queryKey: ["anilist-link-status"] });
      await queryClient.invalidateQueries({ queryKey: ["anilist-sync-status"] });
      await queryClient.invalidateQueries({ queryKey: ["account-title-preference"] });
      notify.success(copy.signedOut);
      navigate({ to: localizedPath(locale, "/") });
    },
    onError: () => {
      notify.error(copy.signOutError, {
        key: "settings:signout:error",
      });
    },
  });

  const user = sessionQuery.data?.user ?? null;
  const linkStatus = (anilistLinkQuery.data?.status ?? "not_linked") as AniListLinkStatus;
  const linkStatusMeta = anilistStatusMeta(linkStatus, locale);
  const activeRun = anilistSyncStatusQuery.data?.run ?? null;
  const runStatus = activeRun?.status ?? "idle";
  const lastCompletedAtMs = activeRun?.finishedAtMs ?? null;
  const recoveredAnimeItems = anilistRecoveredLibraryQuery.data?.items ?? [];
  const recoveredAnimeCount = anilistRecoveredLibraryQuery.data?.total ?? 0;
  const titlePreference = titlePreferenceQuery.data?.titlePreference ?? "mixed";

  useEffect(() => {
    if (!anilistRecoveredLibraryQuery.isError) return;
    notify.error(copy.libraryLoadError, {
      key: "settings:anilist-library:error",
    });
  }, [anilistRecoveredLibraryQuery.isError, copy.libraryLoadError]);

  useEffect(() => {
    if (activeRun?.status !== "error") return;
    notify.error(syncErrorMessage(activeRun.message, locale), {
      key: `settings:anilist-sync-run:error:${activeRun.runId ?? activeRun.createdAtMs ?? "latest"}`,
    });
  }, [activeRun?.createdAtMs, activeRun?.message, activeRun?.runId, activeRun?.status, locale]);

  return (
    <section className="single-panel">
      <article className="panel-card">
        <h2 className="panel-title">{copy.title}</h2>
        <p className="panel-copy">{copy.subtitle}</p>

        {!sessionQuery.isPending && !user && (
          <div className="panel-form">
            <p className="status">{copy.authRequired}</p>
            <div className="waiting-actions">
              <Link className="solid-btn" to={localizedPath(locale, "/auth")}>
                {copy.signIn}
              </Link>
              <Link className="ghost-btn" to={localizedPath(locale, "/")}>
                {copy.backHome}
              </Link>
            </div>
          </div>
        )}

        {sessionQuery.isPending && <p className="status">{copy.loadingAccount}</p>}

        {user && (
          <div className="panel-form">
            <p className="status">
              {copy.connected} <strong>{user.name}</strong> ({user.email})
            </p>

            <div className="provider-link-card">
              <div className="provider-link-head">
                <div>
                  <p className="kicker">AniList</p>
                  <h3>{copy.aniListUsername}</h3>
                </div>
                <span className={`provider-badge ${linkStatusMeta.tone}`}>
                  {linkStatusMeta.label}
                </span>
              </div>
              <p className="status">{linkStatusMeta.description}</p>
              <label>
                <span>{copy.aniListUsername}</span>
                <input
                  value={anilistUsernameInput}
                  onChange={(event) => {
                    setUsernameDirty(true);
                    setAniListUsernameInput(event.currentTarget.value);
                  }}
                  placeholder={copy.aniListUsername}
                  maxLength={50}
                />
              </label>
              <div className="waiting-actions">
                <button
                  className="solid-btn"
                  type="button"
                  disabled={updateAndSyncMutation.isPending || signOutMutation.isPending}
                  onClick={() => updateAndSyncMutation.mutate()}
                >
                  {updateAndSyncMutation.isPending ? copy.updating : copy.update}
                </button>
              </div>
              <p className="status">
                {copy.lastSync}: <strong>{formatSyncTimestamp(lastCompletedAtMs, locale)}</strong>
              </p>
            </div>

            <div className="provider-link-card">
              <div className="provider-link-head">
                <div>
                  <p className="kicker">{copy.animeQuiz}</p>
                  <h3>{copy.titlePreference}</h3>
                </div>
                <span className="provider-badge connected">{titlePreference}</span>
              </div>
              <p className="status">{copy.titlePreferenceHint}</p>
              <div className="waiting-actions">
                {(
                  [
                    { value: "mixed", label: copy.mixed },
                    { value: "romaji", label: copy.romaji },
                    { value: "english", label: copy.english },
                  ] as Array<{ value: TitlePreference; label: string }>
                ).map((entry) => (
                  <button
                    key={entry.value}
                    className={titlePreference === entry.value ? "solid-btn" : "ghost-btn"}
                    type="button"
                    disabled={updateTitlePreferenceMutation.isPending || signOutMutation.isPending}
                    onClick={() => updateTitlePreferenceMutation.mutate(entry.value)}
                  >
                    {titlePreference === entry.value && updateTitlePreferenceMutation.isPending
                      ? copy.updating
                      : entry.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="provider-link-card">
              <div className="provider-link-head">
                <div>
                  <p className="kicker">AniList</p>
                  <h3>{copy.syncState}</h3>
                </div>
                <span
                  className={`provider-badge ${runStatus === "error" ? "expired" : "connected"}`}
                >
                  {syncStatusLabel(runStatus, locale)}
                </span>
              </div>
              <p className="status">
                {copy.progress}:{" "}
                <strong>
                  {typeof activeRun?.progress === "number" ? `${activeRun.progress}%` : "0%"}
                </strong>
              </p>
              <p className="status">
                {copy.lastRun}: {formatSyncTimestamp(activeRun?.createdAtMs ?? null, locale)}
              </p>
            </div>

            <div className="provider-link-card">
              <div className="provider-link-head">
                <div>
                  <p className="kicker">AniList</p>
                  <h3>{copy.recoveredAnime}</h3>
                </div>
                <span
                  className={`provider-badge ${recoveredAnimeCount > 0 ? "connected" : "idle"}`}
                >
                  {recoveredAnimeCount}
                </span>
              </div>
              <p className="status">{copy.recoveredHint}</p>

              {anilistRecoveredLibraryQuery.isPending && (
                <p className="status">{copy.loadingLibrary}</p>
              )}

              {anilistRecoveredLibraryQuery.isError && (
                <p className="status error">{copy.libraryLoadError}</p>
              )}

              {!anilistRecoveredLibraryQuery.isPending && recoveredAnimeItems.length <= 0 && (
                <p className="status">{copy.libraryEmpty}</p>
              )}

              {recoveredAnimeItems.length > 0 && (
                <ul className="anilist-library-list">
                  {recoveredAnimeItems.map((entry) => (
                    <li
                      key={`${entry.animeId}:${entry.listStatus}`}
                      className="anilist-library-item"
                    >
                      <strong>{entry.title}</strong>
                      <span
                        className={`anilist-library-status${
                          entry.listStatus === "WATCHING" ? " watching" : " completed"
                        }`}
                      >
                        {entry.listStatus === "WATCHING"
                          ? copy.statusWatching
                          : copy.statusCompleted}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="waiting-actions">
              <button
                className="ghost-btn danger-btn"
                type="button"
                disabled={signOutMutation.isPending || updateAndSyncMutation.isPending}
                onClick={() => signOutMutation.mutate()}
              >
                {signOutMutation.isPending ? copy.signingOut : copy.signOut}
              </button>
              <Link className="ghost-btn" to={localizedPath(locale, "/")}>
                {copy.backHome}
              </Link>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
