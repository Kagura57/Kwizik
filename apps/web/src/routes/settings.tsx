import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  formatSettingsSyncTimestamp,
  getAniListStatusMeta,
  getSettingsCopy,
  getSettingsPrimaryActionLabel,
  getSettingsTitlePreferenceLabel,
  getSettingsUpdateErrorMessage,
  getSyncErrorMessage,
  getSyncStatusLabel,
  getSyncStatusTone,
} from "../i18n/copy/settings";
import { localizedPath } from "../i18n/locale";
import { usePageSeo } from "../i18n/seo";
import { useCurrentLocale } from "../i18n/useLocale";
import {
  getAccountTitlePreference,
  getAniListRecoveredLibrary,
  getAniListLibrarySyncStatus,
  getAniListLinkStatus,
  getAuthSession,
  queueAniListLibrarySync,
  signOutAccount,
  type TitlePreference,
  updateAccountTitlePreference,
  updateAniListUsername,
} from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

type AniListLinkStatus = "linked" | "not_linked";

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
  const copy = getSettingsCopy(locale);

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
      const username = (usernameDirty ? anilistUsernameInput : anilistLinkQuery.data?.link?.anilistUsername ?? "").trim();
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
      notify.error(getSettingsUpdateErrorMessage(error, locale), {
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
  const linkStatusMeta = getAniListStatusMeta(linkStatus, locale);
  const activeRun = anilistSyncStatusQuery.data?.run ?? null;
  const runStatus = activeRun?.status ?? "idle";
  const lastCompletedAtMs = activeRun?.finishedAtMs ?? null;
  const recoveredAnimeItems = anilistRecoveredLibraryQuery.data?.items ?? [];
  const recoveredAnimeCount = anilistRecoveredLibraryQuery.data?.total ?? 0;
  const titlePreference = titlePreferenceQuery.data?.titlePreference ?? "mixed";
  const currentUsername = anilistLinkQuery.data?.link?.anilistUsername ?? "";
  const displayedUsername = usernameDirty ? anilistUsernameInput : currentUsername;
  const trimmedUsernameInput = displayedUsername.trim();
  const primaryCtaLabel = getSettingsPrimaryActionLabel({
    locale,
    currentUsername,
    nextUsername: displayedUsername,
  });
  const primaryCtaDisabled =
    updateAndSyncMutation.isPending ||
    signOutMutation.isPending ||
    (!trimmedUsernameInput && !currentUsername.trim());

  useEffect(() => {
    if (!anilistRecoveredLibraryQuery.isError) return;
    notify.error(copy.libraryLoadError, {
      key: "settings:anilist-library:error",
    });
  }, [anilistRecoveredLibraryQuery.isError, copy.libraryLoadError]);

  useEffect(() => {
    if (activeRun?.status !== "error") return;
    notify.error(getSyncErrorMessage(activeRun.message, locale), {
      key: `settings:anilist-sync-run:error:${activeRun.runId ?? activeRun.createdAtMs ?? "latest"}`,
    });
  }, [activeRun?.createdAtMs, activeRun?.message, activeRun?.runId, activeRun?.status, locale]);

  return (
    <section className="settings-page">
      <article className="panel-card settings-hero">
        <div className="settings-hero-copy">
          <p className="kicker">{copy.summaryKicker}</p>
          <h2 className="panel-title">{copy.title}</h2>
          <p className="panel-copy">{copy.subtitle}</p>
        </div>

        {sessionQuery.isPending && <p className="status">{copy.loadingAccount}</p>}

        {!sessionQuery.isPending && !user && (
          <div className="settings-guest-card">
            <div className="settings-guest-copy">
              <h3>{copy.summaryTitle}</h3>
              <p className="status">{copy.authRequired}</p>
            </div>
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

        {user && (
          <>
            <div className="settings-account-row">
              <div className="settings-account-chip">
                <span className="field-label">{copy.signedInAs}</span>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <div className="settings-account-chip">
                <span className="field-label">{copy.readiness}</span>
                <strong>{linkStatus === "linked" ? copy.summaryReady : copy.summaryNeedsSetup}</strong>
                <span>{linkStatusMeta.description}</span>
              </div>
            </div>

            <div className="settings-summary-grid">
              <div className="settings-summary-item">
                <span className="field-label">{copy.aniListUsername}</span>
                <strong>{currentUsername || linkStatusMeta.label}</strong>
                <span>{copy.summaryUsernameHint}</span>
              </div>
              <div className="settings-summary-item">
                <span className="field-label">{copy.lastSync}</span>
                <strong>{formatSettingsSyncTimestamp(lastCompletedAtMs, locale)}</strong>
                <span>{getSyncStatusLabel(runStatus, locale)}</span>
              </div>
              <div className="settings-summary-item">
                <span className="field-label">{copy.summaryRecovered}</span>
                <strong>{recoveredAnimeCount}</strong>
                <span>{copy.recoveredHint}</span>
              </div>
            </div>
          </>
        )}
      </article>

      {user && (
        <div className="settings-layout">
          <div className="settings-main">
            <article className="panel-card settings-card settings-card-primary">
              <div className="settings-card-head">
                <div>
                  <p className="kicker">{copy.actionsTitle}</p>
                  <h3>{copy.aniListConnection}</h3>
                </div>
                <span className={`provider-badge ${linkStatusMeta.tone}`}>{linkStatusMeta.label}</span>
              </div>
              <p className="panel-copy">{copy.aniListConnectionHint}</p>
              <label className="settings-field">
                <span>{copy.aniListUsername}</span>
                <input
                  value={displayedUsername}
                  onChange={(event) => {
                    setUsernameDirty(true);
                    setAniListUsernameInput(event.currentTarget.value);
                  }}
                  placeholder={copy.aniListUsername}
                  maxLength={50}
                />
              </label>
              <p className="status">{copy.aniListUsernameHint}</p>
              <div className="waiting-actions">
                <button
                  className="solid-btn"
                  type="button"
                  disabled={primaryCtaDisabled}
                  onClick={() => updateAndSyncMutation.mutate()}
                >
                  {updateAndSyncMutation.isPending ? copy.saving : primaryCtaLabel}
                </button>
              </div>
            </article>

            <article className="panel-card settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="kicker">{copy.animeQuiz}</p>
                  <h3>{copy.titlePreference}</h3>
                </div>
                <span className="provider-badge connected">
                  {getSettingsTitlePreferenceLabel(titlePreference, locale)}
                </span>
              </div>
              <p className="panel-copy">{copy.titlePreferenceHint}</p>
              <div className="settings-segmented-control" role="group" aria-label={copy.titlePreference}>
                {(
                  [
                    { value: "mixed", label: copy.mixed },
                    { value: "romaji", label: copy.romaji },
                    { value: "english", label: copy.english },
                  ] as Array<{ value: TitlePreference; label: string }>
                ).map((entry) => (
                  <button
                    key={entry.value}
                    className={`settings-segment${titlePreference === entry.value ? " is-active" : ""}`}
                    type="button"
                    disabled={updateTitlePreferenceMutation.isPending || signOutMutation.isPending}
                    onClick={() => updateTitlePreferenceMutation.mutate(entry.value)}
                  >
                    {titlePreference === entry.value && updateTitlePreferenceMutation.isPending
                      ? copy.saving
                      : entry.label}
                  </button>
                ))}
              </div>
            </article>

            <article className="panel-card settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="kicker">{copy.sessionActions}</p>
                  <h3>{copy.sessionActions}</h3>
                </div>
              </div>
              <p className="panel-copy">{copy.sessionHint}</p>
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
            </article>
          </div>

          <aside className="settings-side">
            <article className="panel-card settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="kicker">{copy.statusTitle}</p>
                  <h3>{copy.syncState}</h3>
                </div>
                <span className={`provider-badge ${getSyncStatusTone(runStatus)}`}>
                  {getSyncStatusLabel(runStatus, locale)}
                </span>
              </div>
              <p className="panel-copy">{copy.syncStateHint}</p>
              <dl className="settings-stat-list">
                <div>
                  <dt>{copy.progress}</dt>
                  <dd>{typeof activeRun?.progress === "number" ? `${activeRun.progress}%` : "0%"}</dd>
                </div>
                <div>
                  <dt>{copy.lastRun}</dt>
                  <dd>{formatSettingsSyncTimestamp(activeRun?.createdAtMs ?? null, locale)}</dd>
                </div>
                <div>
                  <dt>{copy.lastSync}</dt>
                  <dd>{formatSettingsSyncTimestamp(lastCompletedAtMs, locale)}</dd>
                </div>
              </dl>
              {activeRun?.status === "error" && (
                <p className="status error">{getSyncErrorMessage(activeRun.message, locale)}</p>
              )}
            </article>

            <article className="panel-card settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="kicker">{copy.statusTitle}</p>
                  <h3>{copy.recoveredAnime}</h3>
                </div>
                <span
                  className={`provider-badge ${recoveredAnimeCount > 0 ? "connected" : "idle"}`}
                >
                  {recoveredAnimeCount}
                </span>
              </div>
              <p className="panel-copy">{copy.recoveredHint}</p>

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
            </article>
          </aside>
        </div>
      )}
    </section>
  );
}
