import { fetchJsonWithTimeout } from "./http";
import type { MusicTrack } from "../../services/music-types";
import { readEnvVar } from "../../lib/env";

type YouTubePayload = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
    };
  }>;
};

type YouTubeOEmbedPayload = {
  title?: string;
  author_name?: string;
};

type InvidiousSearchItem = {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  uploader?: string;
};

const YOUTUBE_FAILURE_BACKOFF_MS = 60_000;
const YOUTUBE_KEY_COOLDOWN_MS = 30 * 60_000;
const YOUTUBE_FALLBACK_BACKOFF_MS = 5 * 60_000;
const YOUTUBE_QUERY_CACHE_TTL_MS = 6 * 60 * 60_000;
const YOUTUBE_QUERY_MISS_CACHE_TTL_MS = 90_000;
const YOUTUBE_INVIDIOUS_TIMEOUT_MS = 2_500;
const YOUTUBE_WEB_SEARCH_TIMEOUT_MS = 3_500;
const YOUTUBE_OEMBED_TIMEOUT_MS = 2_500;
const YOUTUBE_WEB_MAX_IDS = 20;
const DEFAULT_INVIDIOUS_INSTANCES = [
  "https://yewtu.be",
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
];

let youtubeSearchBackoffUntilMs = 0;
let youtubeFallbackBackoffUntilMs = 0;
let youtubeKeyRotationIndex = 0;
let youtubeInvidiousRotationIndex = 0;
const youtubeKeyCooldownUntilMs = new Map<string, number>();
const youtubeQueryCache = new Map<
  string,
  {
    tracks: MusicTrack[];
    expiresAt: number;
  }
>();

export function resetYouTubeSearchBackoffForTests() {
  youtubeSearchBackoffUntilMs = 0;
  youtubeFallbackBackoffUntilMs = 0;
  youtubeKeyRotationIndex = 0;
  youtubeInvidiousRotationIndex = 0;
  youtubeKeyCooldownUntilMs.clear();
  youtubeQueryCache.clear();
}

function readYouTubeApiKeys() {
  const fromList = (readEnvVar("YOUTUBE_API_KEYS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const candidates = [
    ...fromList,
    readEnvVar("YOUTUBE_API_KEY"),
    readEnvVar("GOOGLE_API_KEY"),
    readEnvVar("YT_API_KEY"),
  ];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function cacheKey(query: string, safeLimit: number) {
  return `${query.trim().toLowerCase()}::${safeLimit}`;
}

function readCachedQuery(query: string, safeLimit: number) {
  const key = cacheKey(query, safeLimit);
  const cached = youtubeQueryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    youtubeQueryCache.delete(key);
    return null;
  }
  return cached.tracks.slice(0, safeLimit);
}

function writeCachedQuery(query: string, safeLimit: number, tracks: MusicTrack[], ttlMs = YOUTUBE_QUERY_CACHE_TTL_MS) {
  youtubeQueryCache.set(cacheKey(query, safeLimit), {
    tracks: tracks.slice(0, safeLimit),
    expiresAt: Date.now() + ttlMs,
  });
}

function orderedKeysForAttempt(keys: string[]) {
  if (keys.length <= 1) return keys;
  const start = youtubeKeyRotationIndex % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed = new URL(trimmed);
    const normalized = `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`.replace(/\/+$/, "");
    return normalized.length > 0 ? normalized : parsed.origin;
  } catch {
    return null;
  }
}

function readConfiguredInvidiousInstances() {
  const configured = (readEnvVar("YOUTUBE_INVIDIOUS_INSTANCES") ?? "")
    .split(",")
    .map((value) => normalizeBaseUrl(value))
    .filter((value): value is string => Boolean(value));
  return configured;
}

function readInvidiousInstances(useDefaults: boolean) {
  const configured = readConfiguredInvidiousInstances();
  const candidates = configured.length > 0 ? configured : useDefaults ? DEFAULT_INVIDIOUS_INSTANCES : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }
  return normalized;
}

function orderedInstancesForAttempt(instances: string[]) {
  if (instances.length <= 1) return instances;
  const start = youtubeInvidiousRotationIndex % instances.length;
  return [...instances.slice(start), ...instances.slice(0, start)];
}

function parseYouTubeVideoIdsFromHtml(html: string, limit: number) {
  const matches = html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

async function fetchTextWithTimeout(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeByVideoId(tracks: MusicTrack[], limit: number) {
  const seen = new Set<string>();
  const deduped: MusicTrack[] = [];
  for (const track of tracks) {
    const key = track.id.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(track);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

async function searchYouTubeViaInvidious(
  query: string,
  safeLimit: number,
  options: { allowDefaultInstances: boolean },
): Promise<MusicTrack[]> {
  const instances = readInvidiousInstances(options.allowDefaultInstances);
  if (instances.length <= 0) return [];

  const ordered = orderedInstancesForAttempt(instances);
  for (const instance of ordered) {
    const url = new URL(`${instance}/api/v1/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");

      const payload = (await fetchJsonWithTimeout(url, {}, {
        timeoutMs: YOUTUBE_INVIDIOUS_TIMEOUT_MS,
        retries: 0,
      context: {
        provider: "youtube",
        route: "invidious_search",
        instance,
      },
    })) as InvidiousSearchItem[] | null;

    if (!Array.isArray(payload)) continue;

    const tracks = payload
      .map((item) => {
        const id = item.videoId?.trim();
        const title = item.title?.trim();
        const artist = item.author?.trim() || item.uploader?.trim();
        if (!id || !title || !artist) return null;
        return {
          provider: "youtube" as const,
          id,
          title,
          artist,
          previewUrl: null,
          sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        };
      })
      .filter((value): value is MusicTrack => value !== null);

    if (tracks.length > 0) {
      const usedIndex = instances.findIndex((entry) => entry === instance);
      if (usedIndex >= 0) {
        youtubeInvidiousRotationIndex = usedIndex + 1;
      }
      return dedupeByVideoId(tracks, safeLimit);
    }
  }

  return [];
}

async function searchYouTubeViaWeb(query: string, safeLimit: number): Promise<MusicTrack[]> {
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  const html = await fetchTextWithTimeout(url, YOUTUBE_WEB_SEARCH_TIMEOUT_MS);
  if (!html) return [];

  const ids = parseYouTubeVideoIdsFromHtml(html, Math.max(safeLimit * 2, YOUTUBE_WEB_MAX_IDS));
  if (ids.length <= 0) return [];

  const tracks: MusicTrack[] = [];
  const maxIds = Math.min(ids.length, Math.max(safeLimit * 2, safeLimit));
  for (const id of ids.slice(0, maxIds)) {
    const oembedUrl = new URL("https://www.youtube.com/oembed");
    oembedUrl.searchParams.set("url", `https://www.youtube.com/watch?v=${id}`);
    oembedUrl.searchParams.set("format", "json");

    const payload = (await fetchJsonWithTimeout(oembedUrl, {}, {
      timeoutMs: YOUTUBE_OEMBED_TIMEOUT_MS,
      retries: 0,
      context: {
        provider: "youtube",
        route: "oembed_lookup",
      },
    })) as YouTubeOEmbedPayload | null;

    const title = payload?.title?.trim();
    const artist = payload?.author_name?.trim();
    if (!title || !artist) continue;

    tracks.push({
      provider: "youtube",
      id,
      title,
      artist,
      previewUrl: null,
      sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    });

    if (tracks.length >= safeLimit) break;
  }

  if (tracks.length > 0) return dedupeByVideoId(tracks, safeLimit);

  return [];
}

export async function searchYouTube(query: string, limit = 10): Promise<MusicTrack[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const cached = readCachedQuery(normalizedQuery, safeLimit);
  if (cached) return cached;

  const apiKeys = readYouTubeApiKeys();
  let apiReceivedResponse = false;
  if (apiKeys.length > 0 && youtubeSearchBackoffUntilMs <= Date.now()) {
    const now = Date.now();
    const keysToTry = orderedKeysForAttempt(apiKeys).filter((key) => {
      const cooldown = youtubeKeyCooldownUntilMs.get(key) ?? 0;
      return cooldown <= now;
    });

    for (const apiKey of keysToTry) {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", String(safeLimit));
      url.searchParams.set("q", normalizedQuery);
      url.searchParams.set("videoEmbeddable", "true");
      url.searchParams.set("key", apiKey);

      const payload = (await fetchJsonWithTimeout(
        url,
        {},
        {
          timeoutMs: 3_500,
          retries: 0,
          context: {
            provider: "youtube",
            query: normalizedQuery,
          },
        },
      )) as YouTubePayload | null;

      if (!payload) {
        youtubeKeyCooldownUntilMs.set(apiKey, Date.now() + YOUTUBE_KEY_COOLDOWN_MS);
        continue;
      }

      apiReceivedResponse = true;
      youtubeSearchBackoffUntilMs = 0;
      const items = payload.items ?? [];
      const tracks = items
        .map((item) => {
          const id = item.id?.videoId;
          const title = item.snippet?.title?.trim();
          const artist = item.snippet?.channelTitle?.trim();
          if (!id || !title || !artist) return null;
          return {
            provider: "youtube" as const,
            id,
            title,
            artist,
            previewUrl: null,
            sourceUrl: `https://www.youtube.com/watch?v=${id}`,
          };
        })
        .filter((value): value is MusicTrack => value !== null);

      const usedIndex = apiKeys.findIndex((value) => value === apiKey);
      if (usedIndex >= 0) {
        youtubeKeyRotationIndex = usedIndex + 1;
      }

      if (tracks.length > 0) {
        writeCachedQuery(normalizedQuery, safeLimit, tracks);
        return tracks;
      }
    }
  }

  const configuredInvidiousInstances = readConfiguredInvidiousInstances();
  const allowDefaultInvidious = apiKeys.length <= 0;
  if (youtubeFallbackBackoffUntilMs <= Date.now()) {
    const invidiousTracks = await searchYouTubeViaInvidious(normalizedQuery, safeLimit, {
      allowDefaultInstances: allowDefaultInvidious,
    });
    if (invidiousTracks.length > 0) {
      youtubeFallbackBackoffUntilMs = 0;
      writeCachedQuery(normalizedQuery, safeLimit, invidiousTracks);
      return invidiousTracks;
    }

    const webTracks = await searchYouTubeViaWeb(normalizedQuery, safeLimit);
    if (webTracks.length > 0) {
      youtubeFallbackBackoffUntilMs = 0;
      writeCachedQuery(normalizedQuery, safeLimit, webTracks);
      return webTracks;
    }

    if (configuredInvidiousInstances.length > 0 || allowDefaultInvidious) {
      youtubeFallbackBackoffUntilMs = Date.now() + YOUTUBE_FALLBACK_BACKOFF_MS;
    }
  }

  if (apiKeys.length > 0 && !apiReceivedResponse) {
    youtubeSearchBackoffUntilMs = Date.now() + YOUTUBE_FAILURE_BACKOFF_MS;
  }
  writeCachedQuery(normalizedQuery, safeLimit, [], YOUTUBE_QUERY_MISS_CACHE_TTL_MS);
  return [];
}
