import { isSupportedLocale, localizedPath, type SupportedLocale } from "./locale";

export const REMEMBERED_LOCALE_STORAGE_KEY = "kwizik:preferred-locale:v1";

function storage() {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return null;
  }
  return window.localStorage;
}

export function loadRememberedLocale(): SupportedLocale | null {
  const availableStorage = storage();
  if (!availableStorage) return null;

  try {
    const raw = availableStorage.getItem(REMEMBERED_LOCALE_STORAGE_KEY);
    return raw && isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistRememberedLocale(locale: SupportedLocale) {
  const availableStorage = storage();
  if (!availableStorage) return;

  try {
    availableStorage.setItem(REMEMBERED_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage write failures and keep locale switching functional.
  }
}

export function resolveRememberedLocaleHomePath() {
  const rememberedLocale = loadRememberedLocale();
  return rememberedLocale ? localizedPath(rememberedLocale, "/") : null;
}
