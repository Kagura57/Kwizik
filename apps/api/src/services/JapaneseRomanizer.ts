import path from "node:path";
import { createRequire } from "node:module";
import { logEvent } from "../lib/logger";

type KuroshiroConverter = {
  init: (analyzer: unknown) => Promise<void>;
  convert: (
    value: string,
    options: { to: "romaji"; mode: "spaced" | "normal"; romajiSystem?: "hepburn" | "nippon" | "passport" },
  ) => Promise<string>;
};

const JAPANESE_CHAR_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const MAX_CACHE_SIZE = 2_000;

const romajiCache = new Map<string, string | null>();
const pendingConversions = new Map<string, Promise<void>>();
let converterPromise: Promise<KuroshiroConverter | null> | null = null;

function trimCacheIfNeeded() {
  if (romajiCache.size <= MAX_CACHE_SIZE) return;
  const firstKey = romajiCache.keys().next().value;
  if (typeof firstKey === "string") {
    romajiCache.delete(firstKey);
  }
}

function normalizeInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function supportsJapanese(value: string) {
  return JAPANESE_CHAR_PATTERN.test(value);
}

function sanitizeRomaji(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadConverter() {
  if (converterPromise) return converterPromise;

  converterPromise = (async () => {
    try {
      const require = createRequire(import.meta.url);
      const [{ default: Kuroshiro }, { default: KuromojiAnalyzer }] = await Promise.all([
        import("kuroshiro"),
        import("kuroshiro-analyzer-kuromoji"),
      ]);
      const kuromojiPackagePath = require.resolve("kuromoji/package.json");
      const dictPath = path.join(path.dirname(kuromojiPackagePath), "dict");

      const converter = new Kuroshiro() as KuroshiroConverter;
      await converter.init(new KuromojiAnalyzer({ dictPath }));
      return converter;
    } catch (error) {
      logEvent("warn", "japanese_romaji_init_failed", {
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
      return null;
    }
  })();

  return converterPromise;
}

async function convertAndCache(value: string) {
  const normalized = normalizeInput(value);
  if (!normalized || !supportsJapanese(normalized)) {
    romajiCache.set(normalized, null);
    trimCacheIfNeeded();
    return;
  }

  const converter = await loadConverter();
  if (!converter) {
    romajiCache.set(normalized, null);
    trimCacheIfNeeded();
    return;
  }

  try {
    const converted = await converter.convert(normalized, {
      to: "romaji",
      mode: "spaced",
      romajiSystem: "hepburn",
    });
    const romaji = sanitizeRomaji(converted);
    if (!romaji || romaji.toLowerCase() === normalized.toLowerCase()) {
      romajiCache.set(normalized, null);
    } else {
      romajiCache.set(normalized, romaji);
    }
  } catch (error) {
    logEvent("warn", "japanese_romaji_convert_failed", {
      input: normalized,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    romajiCache.set(normalized, null);
  }

  trimCacheIfNeeded();
}

export function getRomanizedJapaneseCached(value: string) {
  const normalized = normalizeInput(value);
  if (!normalized || !supportsJapanese(normalized)) return null;
  return romajiCache.get(normalized) ?? null;
}

export function scheduleRomanizeJapanese(value: string) {
  const normalized = normalizeInput(value);
  if (!normalized || !supportsJapanese(normalized)) return;
  if (romajiCache.has(normalized) || pendingConversions.has(normalized)) return;

  const task = convertAndCache(normalized).finally(() => {
    pendingConversions.delete(normalized);
  });
  pendingConversions.set(normalized, task);
}
