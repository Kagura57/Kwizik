import { useRouterState } from "@tanstack/react-router";
import {
  DEFAULT_LOCALE,
  getLocaleFromPathname,
  type SupportedLocale,
} from "./locale";

export function useOptionalLocale(): SupportedLocale | null {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return getLocaleFromPathname(pathname);
}

export function useCurrentLocale(): SupportedLocale {
  return useOptionalLocale() ?? DEFAULT_LOCALE;
}
