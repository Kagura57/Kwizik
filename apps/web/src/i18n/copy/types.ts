import type { SupportedLocale } from "../locale";

export type LocalizedCopy<T> = Record<SupportedLocale, T>;

export function pickCopy<T>(copy: LocalizedCopy<T>, locale: SupportedLocale): T {
  return copy[locale];
}
