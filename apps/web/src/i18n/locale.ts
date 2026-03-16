export const SUPPORTED_LOCALES = ["fr", "en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "fr";

function normalizePath(path: string) {
  if (!path || path === "/") return "/";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

export function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (!value) return DEFAULT_LOCALE;
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function getLocaleFromPathname(pathname: string): SupportedLocale | null {
  const match = normalizePath(pathname).match(/^\/([^/]+)(?:\/|$)/);
  if (!match) return null;
  return isSupportedLocale(match[1]) ? match[1] : null;
}

export function stripLocaleFromPathname(pathname: string) {
  const normalized = normalizePath(pathname);
  const locale = getLocaleFromPathname(normalized);
  if (!locale) return normalized;
  const stripped = normalized.slice(locale.length + 1);
  return stripped.length > 0 ? stripped : "/";
}

export function localizedPath(locale: SupportedLocale, path = "/") {
  const normalized = stripLocaleFromPathname(path);
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

export function switchLocalePath(pathname: string, targetLocale: SupportedLocale) {
  return localizedPath(targetLocale, stripLocaleFromPathname(pathname));
}

export function getAlternatePathMap(path: string) {
  return {
    fr: localizedPath("fr", path),
    en: localizedPath("en", path),
    "x-default": "/",
  } as const;
}
