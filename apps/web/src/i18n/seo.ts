import { useEffect } from "react";
import { getAlternatePathMap, localizedPath, type SupportedLocale } from "./locale";
import { getRuntimeOrigin } from "../lib/runtimeOrigin";

const SEO_TAG_SELECTOR = "[data-kwizik-seo]";
const DEFAULT_SITE_ORIGIN = "https://kwizik.app";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type SeoConfig = {
  title: string;
  description: string;
  locale: SupportedLocale;
  path: string;
  robots?: string;
  alternatesPath?: string;
  noindex?: boolean;
  socialImagePath?: string;
  socialImageAlt?: string;
  jsonLd?: Record<string, JsonValue> | Array<Record<string, JsonValue>>;
};

type SeoDocument = {
  title: string;
  head: {
    appendChild: (element: SeoElement) => void;
    querySelectorAll: (selector: string) => SeoElement[];
  };
  documentElement: {
    lang: string;
  };
  createElement: (tagName: string) => SeoElement;
};

type SeoElement = {
  tagName?: string;
  textContent: string | null;
  remove: () => void;
  setAttribute: (name: string, value: string) => void;
};

export function getSiteOrigin() {
  return getRuntimeOrigin() ?? DEFAULT_SITE_ORIGIN;
}

export function buildCanonicalUrl(locale: SupportedLocale, path: string) {
  return `${getSiteOrigin()}${localizedPath(locale, path)}`;
}

export function buildAlternateUrls(path: string) {
  const alternates = getAlternatePathMap(path);
  const origin = getSiteOrigin();
  return {
    fr: `${origin}${alternates.fr}`,
    en: `${origin}${alternates.en}`,
    "x-default": `${origin}${alternates["x-default"]}`,
  } as const;
}

function defaultSocialImagePath(locale: SupportedLocale) {
  return locale === "en" ? "/og/kwizik-en.svg" : "/og/kwizik-fr.svg";
}

function defaultSocialImageAlt(locale: SupportedLocale) {
  return locale === "en"
    ? "Kwizik anime blind test multiplayer social card"
    : "Carte de partage Kwizik pour blind test anime multijoueur";
}

export function buildSocialImageUrl(locale: SupportedLocale, imagePath?: string) {
  return `${getSiteOrigin()}${imagePath ?? defaultSocialImagePath(locale)}`;
}

function appendMeta(doc: SeoDocument, name: string, content: string) {
  const element = doc.createElement("meta");
  element.setAttribute("name", name);
  element.setAttribute("content", content);
  element.setAttribute("data-kwizik-seo", "true");
  doc.head.appendChild(element);
}

function appendPropertyMeta(doc: SeoDocument, property: string, content: string) {
  const element = doc.createElement("meta");
  element.setAttribute("property", property);
  element.setAttribute("content", content);
  element.setAttribute("data-kwizik-seo", "true");
  doc.head.appendChild(element);
}

function appendLink(
  doc: SeoDocument,
  rel: string,
  href: string,
  extra: Record<string, string> = {},
) {
  const element = doc.createElement("link");
  element.setAttribute("rel", rel);
  element.setAttribute("href", href);
  element.setAttribute("data-kwizik-seo", "true");
  for (const [key, value] of Object.entries(extra)) {
    element.setAttribute(key, value);
  }
  doc.head.appendChild(element);
}

function appendJsonLd(doc: SeoDocument, payload: SeoConfig["jsonLd"]) {
  if (!payload) return;
  const entries = Array.isArray(payload) ? payload : [payload];
  for (const entry of entries) {
    const element = doc.createElement("script");
    element.setAttribute("type", "application/ld+json");
    element.setAttribute("data-kwizik-seo", "true");
    element.textContent = JSON.stringify(entry);
    doc.head.appendChild(element);
  }
}

export function clearPageSeo(doc: SeoDocument | null = typeof document !== "undefined" ? (document as unknown as SeoDocument) : null) {
  if (!doc) return;
  for (const element of doc.head.querySelectorAll(SEO_TAG_SELECTOR)) {
    element.remove();
  }
}

export function applyPageSeo(
  config: SeoConfig,
  doc: SeoDocument | null = typeof document !== "undefined" ? (document as unknown as SeoDocument) : null,
) {
  if (!doc) return;
  clearPageSeo(doc);
  const canonicalUrl = buildCanonicalUrl(config.locale, config.path);
  const alternates = buildAlternateUrls(config.alternatesPath ?? config.path);
  const robots = config.robots ?? (config.noindex ? "noindex,follow" : "index,follow");
  const socialImageUrl = buildSocialImageUrl(config.locale, config.socialImagePath);
  const socialImageAlt = config.socialImageAlt ?? defaultSocialImageAlt(config.locale);
  const localeValue = config.locale === "fr" ? "fr_FR" : "en_US";
  const alternateLocaleValue = config.locale === "fr" ? "en_US" : "fr_FR";

  doc.title = config.title;
  doc.documentElement.lang = config.locale;

  appendMeta(doc, "description", config.description);
  appendMeta(doc, "robots", robots);
  appendPropertyMeta(doc, "og:title", config.title);
  appendPropertyMeta(doc, "og:description", config.description);
  appendPropertyMeta(doc, "og:type", "website");
  appendPropertyMeta(doc, "og:site_name", "Kwizik");
  appendPropertyMeta(doc, "og:url", canonicalUrl);
  appendPropertyMeta(doc, "og:locale", localeValue);
  appendPropertyMeta(doc, "og:locale:alternate", alternateLocaleValue);
  appendPropertyMeta(doc, "og:image", socialImageUrl);
  appendPropertyMeta(doc, "og:image:secure_url", socialImageUrl);
  appendPropertyMeta(doc, "og:image:type", "image/svg+xml");
  appendPropertyMeta(doc, "og:image:width", "1200");
  appendPropertyMeta(doc, "og:image:height", "630");
  appendPropertyMeta(doc, "og:image:alt", socialImageAlt);
  appendMeta(doc, "twitter:card", "summary_large_image");
  appendMeta(doc, "twitter:title", config.title);
  appendMeta(doc, "twitter:description", config.description);
  appendMeta(doc, "twitter:image", socialImageUrl);
  appendMeta(doc, "twitter:image:alt", socialImageAlt);
  appendLink(doc, "canonical", canonicalUrl);
  appendLink(doc, "alternate", alternates.fr, { hreflang: "fr" });
  appendLink(doc, "alternate", alternates.en, { hreflang: "en" });
  appendLink(doc, "alternate", alternates["x-default"], { hreflang: "x-default" });
  appendJsonLd(doc, config.jsonLd);
}

export function usePageSeo(config: SeoConfig) {
  useEffect(() => {
    applyPageSeo(config);
    return () => {
      clearPageSeo();
    };
  }, [config]);
}
