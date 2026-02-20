import { fetchJsonWithTimeout } from "./http";
import { getSpotifyAccessToken, spotifyAuthDiagnostics } from "./spotify-auth";
import { readEnvVar } from "../../lib/env";
import { logEvent } from "../../lib/logger";
import { providerMetricsSnapshot } from "../../lib/provider-metrics";
import type { MusicTrack } from "../../services/music-types";

type SpotifyArtist = { name?: string };
type SpotifyImage = { url?: string };
type SpotifyItem = {
  id?: string;
  name?: string;
  is_local?: boolean;
  duration_ms?: number | null;
  artists?: SpotifyArtist[];
  preview_url?: string | null;
  external_urls?: {
    spotify?: string;
  };
};
type SpotifyPayload = { tracks?: { items?: SpotifyItem[] } };
type ItunesSearchPayload = {
  results?: Array<{
    trackName?: string;
    artistName?: string;
    previewUrl?: string;
  }>;
};

type SpotifyPlaylistItem = {
  id?: string;
  name?: string;
  description?: string;
  images?: SpotifyImage[];
  external_urls?: {
    spotify?: string;
  };
  owner?: {
    display_name?: string;
  };
  tracks?: {
    total?: number | string | null;
    items?: unknown[];
  };
  items?: {
    total?: number | string | null;
  };
  track_count?: number | string | null;
};

type SpotifyPlaylistSearchPayload = {
  playlists?: {
    items?: SpotifyPlaylistItem[];
  };
};
type SpotifyPlaylistCollectionPayload = {
  playlists?: {
    items?: SpotifyPlaylistItem[];
  };
};
type SpotifyPlaylistMetadataPayload = {
  id?: string;
  name?: string;
  description?: string;
  owner?: {
    display_name?: string;
  };
  tracks?: {
    total?: number | string | null;
    items?: unknown[];
  };
  items?: {
    total?: number | string | null;
  };
  track_count?: number | string | null;
};
type SpotifyOEmbedPayload = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};
type SpotifyBrowseCategoriesPayload = {
  categories?: {
    items?: Array<{
      id?: string;
      name?: string;
    }>;
  };
};

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  externalUrl: string;
  owner: string | null;
  trackCount: number | null;
};

export type SpotifyPlaylistCategory = {
  id: string;
  label: string;
  query: string;
};

export async function searchSpotify(query: string, limit = 10): Promise<MusicTrack[]> {
  const token = await getSpotifyAccessToken();
  if (!token) return [];
  const safeLimit = clampSpotifySearchLimit(limit);
  const market = readSpotifyMarket();

  const buildUrl = (withMarket: boolean) => {
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("type", "track");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(safeLimit));
    if (withMarket) url.searchParams.set("market", market);
    return url;
  };

  let payload = (await fetchJsonWithTimeout(buildUrl(true), {
    headers: { authorization: `Bearer ${token}` },
  }, {
    context: {
      provider: "spotify",
      query,
    },
  })) as SpotifyPayload | null;

  if (!payload) {
    payload = (await fetchJsonWithTimeout(buildUrl(false), {
      headers: { authorization: `Bearer ${token}` },
    }, {
      context: {
        provider: "spotify",
        route: "search_tracks_fallback_no_market",
        query,
      },
    })) as SpotifyPayload | null;
  }

  const items = payload?.tracks?.items ?? [];
  const mapped = items
    .map((item) => {
      const title = item.name?.trim();
      const artist = item.artists?.[0]?.name?.trim();
      if (!item.id || !title || !artist) return null;
      return {
        provider: "spotify" as const,
        id: item.id,
        title,
        artist,
        previewUrl: item.preview_url ?? null,
        sourceUrl: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
      };
    })
    .filter((value): value is MusicTrack => value !== null);
  return enrichSpotifyTracksWithPreview(mapped, safeLimit);
}

type SpotifyPlaylistTrackEntry = {
  track?: SpotifyItem | null;
  item?: SpotifyItem | null;
  is_local?: boolean;
};

type SpotifyPlaylistTrackPayload = {
  items?: Array<SpotifyPlaylistTrackEntry | SpotifyItem | null>;
  tracks?: {
    items?: Array<SpotifyPlaylistTrackEntry | SpotifyItem | null>;
  };
  total?: number;
};

const DEFAULT_SPOTIFY_POPULAR_PLAYLIST_IDS = ["37i9dQZEVXbMDoHDwVN2tF"];
const DEFAULT_SPOTIFY_POPULAR_PLAYLIST_QUERIES = [
  "Today's Top Hits",
  "Top 50 Global",
  "Viral Hits",
  "All Out 2010s",
  "RapCaviar",
  "Rock Classics",
  "Anime Now",
] as const;
const DEFAULT_SPOTIFY_CATEGORY_PRESETS: SpotifyPlaylistCategory[] = [
  { id: "toplists", label: "Top Lists", query: "Top 50 Global" },
  { id: "pop", label: "Pop", query: "Today's Top Hits" },
  { id: "hiphop", label: "Hip-Hop", query: "RapCaviar" },
  { id: "edm_dance", label: "EDM / Dance", query: "mint dance" },
  { id: "rock", label: "Rock", query: "Rock Classics" },
  { id: "anime", label: "Anime", query: "Anime Now" },
];
const itunesPreviewCache = new Map<string, string | null>();
const SPOTIFY_WEB_SEARCH_TIMEOUT_MS = 4_000;
const SPOTIFY_PLAYLIST_ID_REGEX = /(?:\/|\\\/)playlist(?:\/|\\\/)([a-zA-Z0-9]{22})/g;
const SPOTIFY_DEV_SEARCH_LIMIT_MAX = 10;
const SPOTIFY_METADATA_BATCH_SIZE = 3;
const SPOTIFY_METADATA_BATCH_DELAY_MS = 120;
const SPOTIFY_METADATA_ENRICHMENT_MAX = 2;
const SPOTIFY_METADATA_TIMEOUT_MS = 1_500;
const SPOTIFY_TRACK_COUNT_CACHE_TTL_MS = 6 * 60 * 60_000;
const SPOTIFY_RATE_LIMIT_COOLDOWN_MS = 20_000;
const SPOTIFY_PLAYLIST_RETRY_ATTEMPTS = 4;
const SPOTIFY_PLAYLIST_RETRY_DELAY_MS = 350;
const SPOTIFY_PLAYLIST_RETRY_BUDGET_MS = 20_000;
const spotifyTrackCountCache = new Map<string, { value: number; expiresAt: number }>();
let spotifyPlaylistRateLimitedUntilMs = 0;

export const SPOTIFY_RATE_LIMITED_ERROR = "SPOTIFY_RATE_LIMITED";

export function resetSpotifyPlaylistRateLimitForTests() {
  spotifyPlaylistRateLimitedUntilMs = 0;
}

function readSpotifyApiMode() {
  const raw = (readEnvVar("SPOTIFY_API_MODE") ?? "").trim().toLowerCase();
  if (raw === "extended" || raw === "extended_quota") return "extended";
  return "development";
}

export function spotifyPlaylistRateLimitRetryAfterMs() {
  return Math.max(0, spotifyPlaylistRateLimitedUntilMs - Date.now());
}

function isSpotifyPlaylistRateLimited() {
  return spotifyPlaylistRateLimitedUntilMs > Date.now();
}

function registerSpotifyRateLimit(retryAfterMs?: number | null) {
  const fallbackMs = SPOTIFY_RATE_LIMIT_COOLDOWN_MS;
  const normalizedRetryAfterMs =
    typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? Math.max(1_000, Math.min(Math.round(retryAfterMs), SPOTIFY_PLAYLIST_RETRY_BUDGET_MS))
      : fallbackMs;
  spotifyPlaylistRateLimitedUntilMs = Math.max(
    spotifyPlaylistRateLimitedUntilMs,
    Date.now() + normalizedRetryAfterMs,
  );
}

function registerSpotifyRateLimitFromMetrics(retryAfterMs?: number | null) {
  const spotify = providerMetricsSnapshot().spotify;
  if (!spotify || spotify.lastStatus !== 429) return false;

  const lastSeenAtMs = Date.parse(spotify.lastSeenAt);
  if (Number.isFinite(lastSeenAtMs) && Date.now() - lastSeenAtMs > 10_000) {
    return false;
  }

  registerSpotifyRateLimit(retryAfterMs ?? SPOTIFY_RATE_LIMIT_COOLDOWN_MS);
  return true;
}

function spotifySearchLimitMax() {
  return readSpotifyApiMode() === "extended" ? 50 : SPOTIFY_DEV_SEARCH_LIMIT_MAX;
}

function clampSpotifySearchLimit(limit: number) {
  return Math.max(1, Math.min(limit, spotifySearchLimitMax()));
}

function isSpotifyBrowseEnabled() {
  const raw = readEnvVar("SPOTIFY_BROWSE_ENABLED");
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return readSpotifyApiMode() === "extended";
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeSpotifyPlaylistId(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  let decoded = safeDecodeURIComponent(trimmed);
  for (let index = 0; index < 4; index += 1) {
    const stripped = decoded.replace(/^spotify:playlist:/i, "").trim();
    if (stripped === decoded) break;
    decoded = stripped;
  }
  const fromUrl = decoded.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/i)?.[1];
  if (fromUrl) return fromUrl;
  const fromUri = decoded.match(/spotify:playlist:([a-zA-Z0-9]+)/i)?.[1];
  if (fromUri) return fromUri;
  const normalized = decoded.replace(/[?#].*$/, "").replace(/\/+$/, "").trim();
  const plainId = normalized.match(/([a-zA-Z0-9]{8,})$/)?.[1];
  return plainId ?? normalized;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readPopularPlaylistIds() {
  const raw = readEnvVar("SPOTIFY_POPULAR_PLAYLIST_IDS");
  if (!raw) return DEFAULT_SPOTIFY_POPULAR_PLAYLIST_IDS;
  const parsed = raw
    .split(",")
    .map((value) => normalizeSpotifyPlaylistId(value))
    .filter((value) => value.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_SPOTIFY_POPULAR_PLAYLIST_IDS;
}

function readSpotifyMarket() {
  const raw = readEnvVar("SPOTIFY_MARKET") ?? "US";
  const normalized = raw.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return "US";
}

function readSpotifyLocale() {
  const raw = readEnvVar("SPOTIFY_LOCALE");
  if (!raw) return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function toTrack(item: SpotifyItem | null | undefined) {
  if (!item) return null;
  const title = item.name?.trim();
  const artist = item.artists?.[0]?.name?.trim();
  if (!item.id || !title || !artist) return null;
  const durationSec =
    typeof item.duration_ms === "number" && Number.isFinite(item.duration_ms)
      ? Math.max(1, Math.round(item.duration_ms / 1000))
      : null;
  return {
    provider: "spotify" as const,
    id: item.id,
    title,
    artist,
    durationSec,
    previewUrl: item.preview_url ?? null,
    sourceUrl: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
  };
}

function readPlaylistTrackEntry(
  entry: SpotifyPlaylistTrackEntry | SpotifyItem | null | undefined,
) {
  if (!entry) {
    return { track: null, isLocal: false };
  }

  const playlistEntry = entry as SpotifyPlaylistTrackEntry;
  if ("track" in playlistEntry || "item" in playlistEntry || "is_local" in playlistEntry) {
    const track = playlistEntry.track ?? playlistEntry.item ?? null;
    const isLocal = playlistEntry.is_local === true || track?.is_local === true;
    return { track, isLocal };
  }

  const directTrack = entry as SpotifyItem;
  const isLocal = directTrack.is_local === true;
  const track = isLocal ? null : directTrack;
  return { track, isLocal };
}

function mapSpotifyPlaylistItems(items: Array<SpotifyPlaylistTrackEntry | SpotifyItem | null>) {
  let skippedLocalTracks = 0;
  let skippedNullTracks = 0;
  const dedupeSignatures = new Set<string>();
  const tracks: MusicTrack[] = [];

  for (const item of items) {
    const { track, isLocal } = readPlaylistTrackEntry(item);
    if (isLocal) {
      skippedLocalTracks += 1;
      continue;
    }
    if (!track) {
      skippedNullTracks += 1;
      continue;
    }

    const mapped = toTrack(track);
    if (!mapped) {
      skippedNullTracks += 1;
      continue;
    }

    const signature = `${mapped.title.toLowerCase()}::${mapped.artist.toLowerCase()}`;
    if (dedupeSignatures.has(signature)) continue;
    dedupeSignatures.add(signature);
    tracks.push(mapped);
  }

  return {
    tracks,
    skippedLocalTracks,
    skippedNullTracks,
  };
}

function normalizeDescription(raw: string | undefined) {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpotifyTrackCount(raw: unknown) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return null;
}

function parseSpotifyTrackCountFromPayload(
  payload: Pick<SpotifyPlaylistItem, "tracks" | "items" | "track_count"> | null | undefined,
) {
  if (!payload) return null;

  const fromTotal = parseSpotifyTrackCount(payload.tracks?.total);
  if (fromTotal !== null) return fromTotal;

  const fromItemsTotal = parseSpotifyTrackCount(payload.items?.total);
  if (fromItemsTotal !== null) return fromItemsTotal;

  const fromTrackCountField = parseSpotifyTrackCount(payload.track_count);
  if (fromTrackCountField !== null) return fromTrackCountField;

  if (Array.isArray(payload.tracks?.items)) {
    return payload.tracks.items.length;
  }
  return null;
}

function readCachedTrackCount(playlistId: string) {
  const cached = spotifyTrackCountCache.get(playlistId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    spotifyTrackCountCache.delete(playlistId);
    return null;
  }
  return cached.value;
}

function writeCachedTrackCount(playlistId: string, value: number) {
  spotifyTrackCountCache.set(playlistId, {
    value,
    expiresAt: Date.now() + SPOTIFY_TRACK_COUNT_CACHE_TTL_MS,
  });
}

function toPlaylistSummary(item: SpotifyPlaylistItem | null | undefined): SpotifyPlaylistSummary | null {
  if (!item?.id) return null;
  const name = item.name?.trim();
  if (!name) return null;
  return {
    id: item.id,
    name,
    description: normalizeDescription(item.description),
    imageUrl: item.images?.[0]?.url ?? null,
    externalUrl: item.external_urls?.spotify ?? `https://open.spotify.com/playlist/${item.id}`,
    owner: item.owner?.display_name?.trim() ?? null,
    trackCount: parseSpotifyTrackCountFromPayload(item) ?? readCachedTrackCount(item.id),
  };
}

function dedupePlaylists(items: SpotifyPlaylistSummary[]) {
  const seen = new Set<string>();
  const deduped: SpotifyPlaylistSummary[] = [];
  for (const item of items) {
    const key = item.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function playlistScoreForBlindtest(playlist: SpotifyPlaylistSummary) {
  const owner = (playlist.owner ?? "").toLowerCase();
  const name = playlist.name.toLowerCase();
  let score = playlist.trackCount ?? 0;
  if (owner.includes("spotify")) score += 250;
  if (owner.includes("official")) score += 80;
  if (name.includes("top") || name.includes("hits") || name.includes("best") || name.includes("viral")) {
    score += 40;
  }
  if (playlist.imageUrl) score += 15;
  return score;
}

function sortPlaylistsForBlindtest(playlists: SpotifyPlaylistSummary[]) {
  return [...playlists].sort((left, right) => {
    const scoreDelta = playlistScoreForBlindtest(right) - playlistScoreForBlindtest(left);
    if (scoreDelta !== 0) return scoreDelta;
    return left.name.localeCompare(right.name);
  });
}

async function enrichPlaylistTrackCounts(
  token: string,
  playlists: SpotifyPlaylistSummary[],
  maxEnrichment = SPOTIFY_METADATA_ENRICHMENT_MAX,
) {
  const fromCache = playlists.map((playlist) => {
    if (playlist.trackCount !== null) return playlist;
    const cached = readCachedTrackCount(playlist.id);
    if (cached === null) return playlist;
    return {
      ...playlist,
      trackCount: cached,
    };
  });

  const pending = fromCache
    .filter((playlist) => playlist.trackCount === null)
    .slice(0, Math.max(0, maxEnrichment));
  if (pending.length <= 0) return fromCache;

  const enrichedCounts = new Map<string, number>();
  for (let index = 0; index < pending.length; index += SPOTIFY_METADATA_BATCH_SIZE) {
    const chunk = pending.slice(index, index + SPOTIFY_METADATA_BATCH_SIZE);
    await Promise.all(
      chunk.map(async (playlist) => {
        try {
          const metadata = await fetchSpotifyPlaylistMetadata(token, playlist.id);
          const trackCount = parseSpotifyTrackCountFromPayload(metadata);
          if (trackCount !== null) {
            enrichedCounts.set(playlist.id, trackCount);
            writeCachedTrackCount(playlist.id, trackCount);
          }
        } catch {
          // Keep partial results when one metadata call fails.
        }
      }),
    );
    if (index + SPOTIFY_METADATA_BATCH_SIZE < pending.length) {
      await sleep(SPOTIFY_METADATA_BATCH_DELAY_MS);
    }
  }

  if (enrichedCounts.size <= 0) return fromCache;
  return fromCache.map((playlist) => {
    const trackCount = enrichedCounts.get(playlist.id);
    if (typeof trackCount !== "number") return playlist;
    return {
      ...playlist,
      trackCount,
    };
  });
}

function extractSpotifyPlaylistIdsFromHtml(html: string, limit: number) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(SPOTIFY_PLAYLIST_ID_REGEX)) {
    const id = match[1]?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
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

async function searchSpotifyPlaylistsViaWeb(
  query: string,
  limit: number,
  token: string | null = null,
): Promise<SpotifyPlaylistSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const searchUrl = new URL(`https://open.spotify.com/search/${encodeURIComponent(query)}/playlists`);
  const html = await fetchTextWithTimeout(searchUrl, SPOTIFY_WEB_SEARCH_TIMEOUT_MS);
  if (!html) return [];

  const ids = extractSpotifyPlaylistIdsFromHtml(html, safeLimit * 3);
  if (ids.length <= 0) return [];

  const playlists: SpotifyPlaylistSummary[] = [];
  for (const id of ids) {
    const oembedUrl = new URL("https://open.spotify.com/oembed");
    oembedUrl.searchParams.set("url", `https://open.spotify.com/playlist/${id}`);

    const payload = (await fetchJsonWithTimeout(oembedUrl, {}, {
      timeoutMs: 3_500,
      retries: 0,
      context: {
        provider: "spotify",
        route: "search_playlists_web_oembed",
        query,
        playlistId: id,
      },
    })) as SpotifyOEmbedPayload | null;

    const name = payload?.title?.trim();
    if (!name) continue;
    playlists.push({
      id,
      name,
      description: "",
      imageUrl: payload?.thumbnail_url?.trim() ?? null,
      externalUrl: `https://open.spotify.com/playlist/${id}`,
      owner: payload?.author_name?.trim() ?? null,
      trackCount: null,
    });
    if (playlists.length >= safeLimit) break;
  }

  const deduped = sortPlaylistsForBlindtest(dedupePlaylists(playlists)).slice(0, safeLimit);
  if (!token || deduped.length <= 0) return deduped;

  const enriched = await enrichPlaylistTrackCounts(token, deduped);
  return sortPlaylistsForBlindtest(dedupePlaylists(enriched)).slice(0, safeLimit);
}

async function fetchSpotifyPlaylistMetadata(token: string, playlistId: string) {
  const url = new URL(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`);
  url.searchParams.set("fields", "id,name,description,owner(display_name),tracks(total)");

  const payload = (await fetchJsonWithTimeout(
    url,
    {
      headers: { authorization: `Bearer ${token}` },
    },
    {
      timeoutMs: SPOTIFY_METADATA_TIMEOUT_MS,
      retries: 0,
      context: {
        provider: "spotify",
        route: "playlist_metadata",
        playlistId,
      },
    },
  )) as SpotifyPlaylistMetadataPayload | null;

  return payload;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trackKey(track: Pick<MusicTrack, "title" | "artist">) {
  return `${normalizeText(track.title)}::${normalizeText(track.artist)}`;
}

function scoreItunesCandidate(
  track: Pick<MusicTrack, "title" | "artist">,
  candidate: { title: string; artist: string },
) {
  const expectedTitle = normalizeText(track.title);
  const expectedArtist = normalizeText(track.artist);
  const candidateTitle = normalizeText(candidate.title);
  const candidateArtist = normalizeText(candidate.artist);

  let score = 0;
  if (expectedTitle === candidateTitle) score += 4;
  else if (expectedTitle.includes(candidateTitle) || candidateTitle.includes(expectedTitle)) score += 2;

  if (expectedArtist === candidateArtist) score += 4;
  else if (expectedArtist.includes(candidateArtist) || candidateArtist.includes(expectedArtist)) score += 2;

  return score;
}

async function resolveItunesPreviewForTrack(track: Pick<MusicTrack, "title" | "artist">) {
  const cacheKey = trackKey(track);
  if (itunesPreviewCache.has(cacheKey)) {
    return itunesPreviewCache.get(cacheKey) ?? null;
  }

  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", `${track.title} ${track.artist}`);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "12");

  const payload = (await fetchJsonWithTimeout(url, {}, {
    timeoutMs: 5_000,
    retries: 1,
    retryDelayMs: 300,
    context: {
      provider: "itunes",
      route: "search_preview",
      title: track.title,
      artist: track.artist,
    },
  })) as ItunesSearchPayload | null;

  const candidates = (payload?.results ?? [])
    .map((item) => {
      const previewUrl = item.previewUrl?.trim();
      const title = item.trackName?.trim();
      const artist = item.artistName?.trim();
      if (!previewUrl || !title || !artist) return null;
      return {
        previewUrl,
        title,
        artist,
      };
    })
    .filter((value): value is { previewUrl: string; title: string; artist: string } => value !== null);

  const best = candidates
    .map((candidate) => ({
      candidate,
      score: scoreItunesCandidate(track, candidate),
    }))
    .sort((a, b) => b.score - a.score)[0];

  const resolved = best && best.score >= 4 ? best.candidate.previewUrl : null;
  itunesPreviewCache.set(cacheKey, resolved);
  return resolved;
}

async function enrichSpotifyTracksWithPreview(tracks: MusicTrack[], targetPreviewCount: number) {
  const safeTarget = Math.max(1, targetPreviewCount);
  const enriched: MusicTrack[] = [];
  let previewCount = tracks.filter((track) => Boolean(track.previewUrl)).length;

  for (const track of tracks) {
    if (track.previewUrl || previewCount >= safeTarget) {
      enriched.push(track);
      continue;
    }

    const previewUrl = await resolveItunesPreviewForTrack(track);
    if (previewUrl) {
      enriched.push({
        ...track,
        previewUrl,
      });
      previewCount += 1;
      continue;
    }

    enriched.push(track);
  }

  return enriched;
}

function prioritizeByPreview(tracks: MusicTrack[], limit: number) {
  const withPreview = tracks.filter((track) => Boolean(track.previewUrl));
  const withoutPreview = tracks.filter((track) => !track.previewUrl);
  return [...withPreview, ...withoutPreview].slice(0, Math.max(1, limit));
}

function readPopularPlaylistQueries() {
  const raw = readEnvVar("SPOTIFY_POPULAR_PLAYLIST_QUERIES");
  if (!raw) return [...DEFAULT_SPOTIFY_POPULAR_PLAYLIST_QUERIES];
  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_SPOTIFY_POPULAR_PLAYLIST_QUERIES];
}

export function spotifyPlaylistCategories() {
  return [...DEFAULT_SPOTIFY_CATEGORY_PRESETS];
}

export async function fetchSpotifyPlaylistCategories(limit = 24): Promise<SpotifyPlaylistCategory[]> {
  if (!isSpotifyBrowseEnabled()) return spotifyPlaylistCategories();

  const token = await getSpotifyAccessToken();
  if (!token) return spotifyPlaylistCategories();

  const safeLimit = clampSpotifySearchLimit(limit);
  const url = new URL("https://api.spotify.com/v1/browse/categories");
  url.searchParams.set("country", readSpotifyMarket());
  url.searchParams.set("limit", String(safeLimit));
  const locale = readSpotifyLocale();
  if (locale) {
    url.searchParams.set("locale", locale);
  }

  const payload = (await fetchJsonWithTimeout(
    url,
    {
      headers: { authorization: `Bearer ${token}` },
    },
    {
      context: {
        provider: "spotify",
        route: "browse_categories",
        limit: safeLimit,
      },
    },
  )) as SpotifyBrowseCategoriesPayload | null;

  const dynamicCategories = (payload?.categories?.items ?? [])
    .map((item) => {
      const id = item.id?.trim().toLowerCase();
      const label = item.name?.trim();
      if (!id || !label) return null;
      return {
        id,
        label,
        query: label,
      } satisfies SpotifyPlaylistCategory;
    })
    .filter((value): value is SpotifyPlaylistCategory => value !== null);

  if (dynamicCategories.length > 0) return dynamicCategories;
  return spotifyPlaylistCategories();
}

export async function searchSpotifyPlaylists(query: string, limit = 20): Promise<SpotifyPlaylistSummary[]> {
  const safeLimit = clampSpotifySearchLimit(limit);
  const token = await getSpotifyAccessToken();
  if (!token) return searchSpotifyPlaylistsViaWeb(query, safeLimit, null);
  const market = readSpotifyMarket();
  const buildUrl = (withMarket: boolean) => {
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("type", "playlist");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(safeLimit));
    if (withMarket) url.searchParams.set("market", market);
    return url;
  };

  let payload = (await fetchJsonWithTimeout(
    buildUrl(true),
    {
      headers: { authorization: `Bearer ${token}` },
    },
    {
      context: {
        provider: "spotify",
        route: "search_playlists",
        query,
      },
    },
  )) as SpotifyPlaylistSearchPayload | null;

  if (!payload) {
    payload = (await fetchJsonWithTimeout(
      buildUrl(false),
      {
        headers: { authorization: `Bearer ${token}` },
      },
      {
        context: {
          provider: "spotify",
          route: "search_playlists_fallback_no_market",
          query,
        },
      },
    )) as SpotifyPlaylistSearchPayload | null;
  }
  const rawItems = payload?.playlists?.items;
  logEvent("info", "spotify_playlist_search_raw_payload", {
    query,
    requestedLimit: safeLimit,
    hasPlaylistsObject: Boolean(payload?.playlists),
    itemsType: Array.isArray(rawItems) ? "array" : typeof rawItems,
    itemCount: Array.isArray(rawItems) ? rawItems.length : 0,
    firstItemKeys: Array.isArray(rawItems) && rawItems[0] ? Object.keys(rawItems[0]).slice(0, 10) : [],
  });

  const items = payload?.playlists?.items ?? [];
  const fromSearch = sortPlaylistsForBlindtest(
    dedupePlaylists(
      items
        .map((item) => toPlaylistSummary(item))
        .filter((value): value is SpotifyPlaylistSummary => value !== null),
    ),
  ).slice(0, safeLimit);
  if (fromSearch.length > 0) {
    const enriched = await enrichPlaylistTrackCounts(token, fromSearch);
    logEvent("info", "spotify_playlist_search_mapped_payload", {
      query,
      requestedLimit: safeLimit,
      mappedCount: fromSearch.length,
      enrichedCount: enriched.length,
      firstMapped: enriched[0]
        ? {
            id: enriched[0].id,
            name: enriched[0].name,
            trackCount: enriched[0].trackCount,
          }
        : null,
    });
    return sortPlaylistsForBlindtest(dedupePlaylists(enriched)).slice(0, safeLimit);
  }

  if (!isSpotifyBrowseEnabled()) {
    return searchSpotifyPlaylistsViaWeb(query, safeLimit, token);
  }

  const featuredBuildUrl = (withCountry: boolean) => {
    const url = new URL("https://api.spotify.com/v1/browse/featured-playlists");
    if (withCountry) url.searchParams.set("country", market);
    url.searchParams.set("limit", String(safeLimit));
    const locale = readSpotifyLocale();
    if (locale) {
      url.searchParams.set("locale", locale);
    }
    return url;
  };

  let featuredPayload = (await fetchJsonWithTimeout(
    featuredBuildUrl(true),
    {
      headers: { authorization: `Bearer ${token}` },
    },
    {
      context: {
        provider: "spotify",
        route: "search_playlists_featured_fallback",
        query,
      },
    },
  )) as SpotifyPlaylistCollectionPayload | null;

  if (!featuredPayload) {
    featuredPayload = (await fetchJsonWithTimeout(
      featuredBuildUrl(false),
      {
        headers: { authorization: `Bearer ${token}` },
      },
      {
        context: {
          provider: "spotify",
          route: "search_playlists_featured_fallback_no_country",
          query,
        },
      },
    )) as SpotifyPlaylistCollectionPayload | null;
  }

  const featured = sortPlaylistsForBlindtest(
    dedupePlaylists(
      (featuredPayload?.playlists?.items ?? [])
        .map((item) => toPlaylistSummary(item))
        .filter((value): value is SpotifyPlaylistSummary => value !== null),
    ),
  ).slice(0, safeLimit);
  if (featured.length > 0) {
    const enriched = await enrichPlaylistTrackCounts(token, featured);
    return sortPlaylistsForBlindtest(dedupePlaylists(enriched)).slice(0, safeLimit);
  }

  return searchSpotifyPlaylistsViaWeb(query, safeLimit, token);
}

export async function fetchSpotifyPlaylistsForCategory(
  categoryId: string,
  limit = 20,
): Promise<SpotifyPlaylistSummary[]> {
  const normalizedCategoryId = categoryId.trim().toLowerCase();
  if (!normalizedCategoryId) return [];

  const safeLimit = clampSpotifySearchLimit(limit);
  if (!isSpotifyBrowseEnabled()) {
    const category = spotifyPlaylistCategories().find((entry) => entry.id === normalizedCategoryId);
    const fallbackQuery = category?.query ?? normalizedCategoryId.replace(/[_-]+/g, " ");
    return searchSpotifyPlaylists(fallbackQuery, safeLimit);
  }

  const token = await getSpotifyAccessToken();
  const market = readSpotifyMarket();

  if (token) {
    const url = new URL(
      `https://api.spotify.com/v1/browse/categories/${encodeURIComponent(normalizedCategoryId)}/playlists`,
    );
    url.searchParams.set("country", market);
    url.searchParams.set("limit", String(safeLimit));
    const locale = readSpotifyLocale();
    if (locale) {
      url.searchParams.set("locale", locale);
    }

    const payload = (await fetchJsonWithTimeout(
      url,
      {
        headers: { authorization: `Bearer ${token}` },
      },
      {
        context: {
          provider: "spotify",
          route: "browse_category_playlists",
          categoryId: normalizedCategoryId,
          limit: safeLimit,
        },
      },
    )) as SpotifyPlaylistCollectionPayload | null;

    const categoryPlaylists = sortPlaylistsForBlindtest(
      dedupePlaylists(
        (payload?.playlists?.items ?? [])
          .map((item) => toPlaylistSummary(item))
          .filter((value): value is SpotifyPlaylistSummary => value !== null),
      ),
    ).slice(0, safeLimit);

    if (categoryPlaylists.length > 0) {
      const enriched = await enrichPlaylistTrackCounts(token, categoryPlaylists);
      return sortPlaylistsForBlindtest(dedupePlaylists(enriched)).slice(0, safeLimit);
    }
  }

  const category = spotifyPlaylistCategories().find((entry) => entry.id === normalizedCategoryId);
  const fallbackQuery = category?.query ?? normalizedCategoryId.replace(/[_-]+/g, " ");
  return searchSpotifyPlaylists(fallbackQuery, safeLimit);
}

export async function fetchSpotifyPopularPlaylists(limit = 20): Promise<SpotifyPlaylistSummary[]> {
  const safeLimit = clampSpotifySearchLimit(limit);
  const browseEnabled = isSpotifyBrowseEnabled();
  const token = await getSpotifyAccessToken();
  const market = readSpotifyMarket();

  if (token && browseEnabled) {
    const featuredUrl = new URL("https://api.spotify.com/v1/browse/featured-playlists");
    featuredUrl.searchParams.set("country", market);
    featuredUrl.searchParams.set("limit", String(safeLimit));
    const locale = readSpotifyLocale();
    if (locale) {
      featuredUrl.searchParams.set("locale", locale);
    }

    const featuredPayload = (await fetchJsonWithTimeout(
      featuredUrl,
      {
        headers: { authorization: `Bearer ${token}` },
      },
      {
        context: {
          provider: "spotify",
          route: "browse_featured_playlists",
          limit: safeLimit,
        },
      },
    )) as SpotifyPlaylistCollectionPayload | null;

    const featuredPlaylists = sortPlaylistsForBlindtest(
      dedupePlaylists(
        (featuredPayload?.playlists?.items ?? [])
          .map((item) => toPlaylistSummary(item))
          .filter((value): value is SpotifyPlaylistSummary => value !== null),
      ),
    ).slice(0, safeLimit);

    if (featuredPlaylists.length > 0) {
      const enriched = await enrichPlaylistTrackCounts(token, featuredPlaylists);
      return sortPlaylistsForBlindtest(dedupePlaylists(enriched)).slice(0, safeLimit);
    }
  }

  const queries = readPopularPlaylistQueries();
  const merged: SpotifyPlaylistSummary[] = [];

  for (const query of queries) {
    const playlists = await searchSpotifyPlaylists(query, Math.min(10, safeLimit));
    merged.push(...playlists);
    if (merged.length >= safeLimit * 2) break;
  }

  return sortPlaylistsForBlindtest(dedupePlaylists(merged)).slice(0, safeLimit);
}

export async function fetchSpotifyPlaylistTracks(
  playlistId: string,
  limit = 20,
  _options: { enrichPreview?: boolean } = {},
): Promise<MusicTrack[]> {
  const token = await getSpotifyAccessToken();
  if (!token) {
    const diagnostics = spotifyAuthDiagnostics();
    console.error("[spotify] missing access token for playlist fetch", {
      playlistId,
      diagnostics,
    });
    logEvent("error", "spotify_playlist_missing_access_token", {
      playlistId,
      diagnostics,
    });
    return [];
  }

  const normalizedPlaylistId = normalizeSpotifyPlaylistId(playlistId);
  if (!normalizedPlaylistId) {
    logEvent("warn", "spotify_playlist_invalid_id", {
      playlistId,
    });
    return [];
  }

  try {
    const safeLimit = 100;
    if (isSpotifyPlaylistRateLimited()) {
      throw new Error(SPOTIFY_RATE_LIMITED_ERROR);
    }

    const url = new URL(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(normalizedPlaylistId)}/tracks`,
    );
    url.searchParams.set("limit", String(safeLimit));
    url.searchParams.set("offset", "0");

    let observedRetryAfterMs: number | null = null;
    const payload = (await fetchJsonWithTimeout(
      url,
      {
        headers: { authorization: `Bearer ${token}` },
      },
      {
        timeoutMs: 4_000,
        retries: SPOTIFY_PLAYLIST_RETRY_ATTEMPTS,
        retryDelayMs: SPOTIFY_PLAYLIST_RETRY_DELAY_MS,
        maxRetryAfterMs: SPOTIFY_PLAYLIST_RETRY_BUDGET_MS,
        maxTotalRetryMs: SPOTIFY_PLAYLIST_RETRY_BUDGET_MS,
        context: {
          provider: "spotify",
          route: "playlist_tracks_single_page",
          playlistId: normalizedPlaylistId,
          offset: 0,
          requestedLimit: safeLimit,
        },
        onHttpError: ({ status, retryAfterMs }) => {
          if (status !== 429) return;
          if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
            observedRetryAfterMs = Math.max(observedRetryAfterMs ?? 0, Math.round(retryAfterMs));
          } else if (observedRetryAfterMs === null) {
            observedRetryAfterMs = SPOTIFY_RATE_LIMIT_COOLDOWN_MS;
          }
        },
      },
    )) as SpotifyPlaylistTrackPayload | null;

    const rawItems = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.tracks?.items)
        ? payload.tracks.items
        : null;

    if (!Array.isArray(rawItems)) {
      if (registerSpotifyRateLimitFromMetrics(observedRetryAfterMs)) {
        throw new Error(SPOTIFY_RATE_LIMITED_ERROR);
      }

      console.error("[spotify] single-page playlist fetch failed", {
        playlistId: normalizedPlaylistId,
        sourcePlaylistId: playlistId,
        requestedLimit: safeLimit,
        hasPayload: Boolean(payload),
      });
      logEvent("warn", "spotify_playlist_tracks_empty", {
        playlistId: normalizedPlaylistId,
        endpointUsed: "tracks",
        metadataTotal: null,
        pagesFetched: 0,
        fetchedItems: 0,
        skippedLocalTracks: 0,
        skippedNullTracks: 0,
        requestedLimit: safeLimit,
      });
      return [];
    }

    const items = rawItems.filter((entry): entry is SpotifyPlaylistTrackEntry | SpotifyItem =>
      Boolean(entry && typeof entry === "object"),
    );
    const mapped = mapSpotifyPlaylistItems(items);
    const deduped = mapped.tracks.slice(0, safeLimit);
    console.log("Spotify tracks mapped:", deduped.length);
    if (deduped.length === 0) {
      console.error("[spotify] no usable tracks after playlist parsing", {
        playlistId: normalizedPlaylistId,
        sourcePlaylistId: playlistId,
        endpointUsed: "tracks",
        marketUsed: "none",
        metadataTotal: null,
        pagesFetched: 1,
        fetchedItems: items.length,
        skippedLocalTracks: mapped.skippedLocalTracks,
        skippedNullTracks: mapped.skippedNullTracks,
        requestedLimit: safeLimit,
      });
      logEvent("warn", "spotify_playlist_tracks_empty", {
        playlistId: normalizedPlaylistId,
        endpointUsed: "tracks",
        metadataTotal: null,
        pagesFetched: 1,
        fetchedItems: items.length,
        skippedLocalTracks: mapped.skippedLocalTracks,
        skippedNullTracks: mapped.skippedNullTracks,
        requestedLimit: safeLimit,
      });
      return [];
    }

    spotifyPlaylistRateLimitedUntilMs = 0;

    const previewBefore = deduped.filter((track) => Boolean(track.previewUrl)).length;
    logEvent("info", "spotify_playlist_preview_coverage", {
      playlistId: normalizedPlaylistId,
      sourcePlaylistId: playlistId,
      market: "none",
      marketUsed: "none",
      endpointUsed: "tracks",
      requestedLimit: safeLimit,
      metadataTotal: null,
      pagesFetched: 1,
      fetchedItems: items.length,
      dedupedCount: deduped.length,
      skippedLocalTracks: mapped.skippedLocalTracks,
      skippedNullTracks: mapped.skippedNullTracks,
      previewBefore,
      previewAfter: previewBefore,
    });
    return deduped;
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === SPOTIFY_RATE_LIMITED_ERROR) {
      logEvent("warn", "spotify_playlist_rate_limited", {
        playlistId: normalizedPlaylistId,
        sourcePlaylistId: playlistId,
        requestedLimit: 100,
        retryAfterMs: spotifyPlaylistRateLimitRetryAfterMs(),
      });
      throw error instanceof Error ? error : new Error(SPOTIFY_RATE_LIMITED_ERROR);
    }
    console.error("[spotify] fetchSpotifyPlaylistTracks unexpected failure", {
      playlistId: normalizedPlaylistId,
      limit,
      error: message,
    });
    logEvent("error", "spotify_playlist_tracks_unexpected_failure", {
      playlistId: normalizedPlaylistId,
      limit,
      error: message,
    });
    return [];
  }
}

export async function fetchSpotifyPopularTracks(
  limit = 20,
  options: { enrichPreview?: boolean } = {},
): Promise<MusicTrack[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const playlistIds = readPopularPlaylistIds();
  const merged: MusicTrack[] = [];
  const seen = new Set<string>();

  for (const playlistId of playlistIds) {
    const tracks = await fetchSpotifyPlaylistTracks(playlistId, safeLimit, options);
    for (const track of tracks) {
      const signature = `${track.title.toLowerCase()}::${track.artist.toLowerCase()}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      merged.push(track);
      if (merged.length >= safeLimit * 3) {
        return prioritizeByPreview(merged, safeLimit);
      }
    }
  }

  return prioritizeByPreview(merged, safeLimit);
}
