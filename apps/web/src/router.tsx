import { createRootRoute, createRoute, createRouter, notFound, redirect } from "@tanstack/react-router";
import { isSupportedLocale } from "./i18n/locale";
import { persistRememberedLocale, resolveRememberedLocaleHomePath } from "./i18n/localeMemory";
import { RootLayout } from "./routes/__root";
import { AuthPage } from "./routes/auth";
import { HomePage } from "./routes/index";
import { JoinPage } from "./routes/join";
import { LocalizedLayout } from "./routes/localized-layout";
import { RoomPlayPage } from "./routes/room/$roomCode/play";
import { RoomViewPage } from "./routes/room/$roomCode/view";
import { RootLanguagePage } from "./routes/root-language";
import { SettingsPage } from "./routes/settings";

const rootRoute = createRootRoute({
  component: RootLayout,
});

export function redirectToRememberedLocaleHome() {
  return resolveRememberedLocaleHomePath();
}

export function validateAndRememberLocale(locale: string) {
  if (!isSupportedLocale(locale)) {
    throw notFound();
  }

  persistRememberedLocale(locale);
  return locale;
}

const rootLanguageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    const rememberedHomePath = redirectToRememberedLocaleHome();
    if (!rememberedHomePath) return;

    throw redirect({
      to: rememberedHomePath,
    });
  },
  component: RootLanguagePage,
});

const localeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$locale",
  beforeLoad: ({ params }) => {
    validateAndRememberLocale(params.locale);
  },
  component: LocalizedLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: "/",
  component: HomePage,
});

const joinRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: "join",
  component: JoinPage,
});

const authRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: "auth",
  component: AuthPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: "settings",
  component: SettingsPage,
});

const roomPlayRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: "room/$roomCode/play",
  component: RoomPlayPage,
});

const roomViewRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: "room/$roomCode/view",
  component: RoomViewPage,
});

const routeTree = rootRoute.addChildren([
  rootLanguageRoute,
  localeRoute.addChildren([
    homeRoute,
    joinRoute,
    authRoute,
    settingsRoute,
    roomPlayRoute,
    roomViewRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
