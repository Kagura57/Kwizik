import { MouseEvent, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { getRootCopy } from "../i18n/copy/root";
import { DEFAULT_LOCALE, localizedPath, switchLocalePath } from "../i18n/locale";
import { useOptionalLocale } from "../i18n/useLocale";
import { getAuthSession, leaveRoom as leaveRoomApi, signOutAccount } from "../lib/api";
import { notify } from "../lib/notify";
import { useGameStore } from "../stores/gameStore";

export function RootLayout() {
  const clearSession = useGameStore((state) => state.clearSession);
  const session = useGameStore((state) => state.session);
  const account = useGameStore((state) => state.account);
  const setAccount = useGameStore((state) => state.setAccount);
  const clearAccount = useGameStore((state) => state.clearAccount);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const locale = useOptionalLocale();
  const activeLocale = locale ?? DEFAULT_LOCALE;
  const wasInRoomRef = useRef(false);
  const leavingForHomeRef = useRef(false);
  const isRoomRoute = /^\/(fr|en)\/room\/[^/]+\/(play|view)$/.test(pathname);
  const otherLocale = activeLocale === "fr" ? "en" : "fr";
  const homePath = localizedPath(activeLocale, "/");
  const settingsPath = localizedPath(activeLocale, "/settings");
  const authPath = localizedPath(activeLocale, "/auth");
  const switchLanguagePath = switchLocalePath(pathname, otherLocale);
  const copy = getRootCopy(activeLocale);

  const authSessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: getAuthSession,
    retry: false,
    staleTime: 60_000,
  });

  const signOutMutation = useMutation({
    mutationFn: signOutAccount,
    onSuccess: async () => {
      clearAccount();
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      await queryClient.invalidateQueries({ queryKey: ["anilist-link-status"] });
      await queryClient.invalidateQueries({ queryKey: ["anilist-sync-status"] });
      notify.success(copy.signOutSuccess);
    },
    onError: () => {
      notify.error(copy.signOutError, {
        key: "auth:signout:error",
      });
    },
  });

  useEffect(() => {
    if (!isRoomRoute && wasInRoomRef.current) {
      if (session.roomCode && session.playerId) {
        void leaveRoomApi({
          roomCode: session.roomCode,
          playerId: session.playerId,
        }).catch(() => undefined);
      }
      clearSession();
    }
    wasInRoomRef.current = isRoomRoute;
  }, [clearSession, isRoomRoute, session.playerId, session.roomCode]);

  function onRoomHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isRoomRoute) return;
    if (leavingForHomeRef.current) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    leavingForHomeRef.current = true;

    const finish = () => {
      clearSession();
      navigate({ to: homePath });
      leavingForHomeRef.current = false;
    };

    if (!session.roomCode || !session.playerId) {
      finish();
      return;
    }

    void leaveRoomApi({
      roomCode: session.roomCode,
      playerId: session.playerId,
    })
      .catch(() => undefined)
      .finally(finish);
  }

  useEffect(() => {
    if (!authSessionQuery.isSuccess) return;
    if (!authSessionQuery.data?.user) {
      clearAccount();
      return;
    }

    setAccount({
      userId: authSessionQuery.data.user.id,
      name: authSessionQuery.data.user.name,
      email: authSessionQuery.data.user.email,
    });
  }, [authSessionQuery.data, authSessionQuery.isSuccess, clearAccount, setAccount]);

  if (locale === null) {
    return (
      <>
        <Toaster
          className="kwizik-toaster"
          position="top-right"
          closeButton
          visibleToasts={4}
          expand={false}
          gap={10}
          offset={20}
          mobileOffset={16}
          containerAriaLabel={copy.notifications}
          toastOptions={{
            classNames: {
              toast: "kwizik-toast",
              content: "kwizik-toast-content",
              title: "kwizik-toast-title",
              description: "kwizik-toast-description",
              closeButton: "kwizik-toast-close",
              actionButton: "kwizik-toast-action",
              cancelButton: "kwizik-toast-cancel",
              success: "kwizik-toast-success",
              error: "kwizik-toast-error",
              info: "kwizik-toast-info",
              loading: "kwizik-toast-loading",
              default: "kwizik-toast-default",
            },
          }}
        />
        <Outlet />
      </>
    );
  }

  const shell = isRoomRoute ? (
    <main className="game-shell">
      <header className="room-topbar">
        <Link className="brand" to={homePath} onClick={onRoomHomeClick}>
          <img className="brand-lockup" src="/logo.svg" alt="Kwizik" />
        </Link>
        <div id="room-topbar-status-slot" className="room-topbar-status-slot" aria-live="polite" />
        <Link className="ghost-btn" to={homePath} onClick={onRoomHomeClick}>
          {copy.home}
        </Link>
      </header>
      <Outlet />
    </main>
  ) : (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to={homePath}>
          <img className="brand-lockup" src="/logo.svg" alt="Kwizik" />
        </Link>
        <p className="brand-subtitle">{copy.subtitle}</p>
        <p className="topbar-meta">{copy.meta}</p>
        <nav className="topbar-nav">
          <Link className="ghost-btn" to={homePath}>
            {copy.home}
          </Link>
          <a className="ghost-btn" href={switchLanguagePath} hrefLang={otherLocale} lang={otherLocale}>
            {copy.languageLabel}
          </a>
          {account.userId ? (
            <>
              <Link className="ghost-btn" to={settingsPath}>
                {account.name ?? copy.settings}
              </Link>
              <button
                className="ghost-btn"
                type="button"
                disabled={signOutMutation.isPending}
                onClick={() => signOutMutation.mutate()}
              >
                {signOutMutation.isPending ? copy.signingOut : copy.signOut}
              </button>
            </>
          ) : (
            <Link className="solid-btn" to={authPath}>
              {copy.signIn}
            </Link>
          )}
        </nav>
      </header>
      <Outlet />
    </main>
  );

  return (
    <>
      <Toaster
        className="kwizik-toaster"
        position="top-right"
        closeButton
        visibleToasts={4}
        expand={false}
        gap={10}
        offset={20}
        mobileOffset={16}
        containerAriaLabel="Notifications"
        toastOptions={{
          classNames: {
            toast: "kwizik-toast",
            content: "kwizik-toast-content",
            title: "kwizik-toast-title",
            description: "kwizik-toast-description",
            closeButton: "kwizik-toast-close",
            actionButton: "kwizik-toast-action",
            cancelButton: "kwizik-toast-cancel",
            success: "kwizik-toast-success",
            error: "kwizik-toast-error",
            info: "kwizik-toast-info",
            loading: "kwizik-toast-loading",
            default: "kwizik-toast-default",
          },
        }}
      />
      {shell}
    </>
  );
}
