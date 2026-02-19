import { fetchJsonWithTimeout } from "./http";
import { getSpotifyAccessToken } from "./spotify-auth";
import { readEnvVar } from "../../lib/env";
import { logEvent } from "../../lib/logger";
import type { MusicTrack } from "../../services/music-types";

type SpotifyArtist = { name?: string };
type SpotifyImage = { url?: string };
type SpotifyItem = {
  id?: string;
  name?: string;
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
    total?: number;
  };
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
  const safeLimit = Math.max(1, Math.min(limit, 50));
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

type SpotifyPlaylistTrackPayload = {
  items?: Array<{
    track?: SpotifyItem | null;
    item?: SpotifyItem | null;
  }>;
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
  const decoded = safeDecodeURIComponent(trimmed);
  const fromUri = decoded.match(/spotify:playlist:([a-zA-Z0-9]+)/i)?.[1];
  if (fromUri) return fromUri;
  const fromUrl = decoded.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/i)?.[1];
  if (fromUrl) return fromUrl;
  return decoded.replace(/[?#].*$/, "").trim();
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
  return normalized.length > 0 ? normalized : "US";
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
  return {
    provider: "spotify" as const,
    id: item.id,
    title,
    artist,
    previewUrl: item.preview_url ?? null,
    sourceUrl: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
  };
}

function normalizeDescription(raw: string | undefined) {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    trackCount: typeof item.tracks?.total === "number" ? item.tracks.total : null,
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

async function searchSpotifyPlaylistsViaWeb(query: string, limit: number): Promise<SpotifyPlaylistSummary[]> {
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

  return sortPlaylistsForBlindtest(dedupePlaylists(playlists)).slice(0, safeLimit);
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
  const token = await getSpotifyAccessToken();
  if (!token) return spotifyPlaylistCategories();

  const safeLimit = Math.max(1, Math.min(limit, 50));
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
  const token = await getSpotifyAccessToken();
  if (!token) return [];

  const safeLimit = Math.max(1, Math.min(limit, 50));
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

  const items = payload?.playlists?.items ?? [];
  const fromSearch = sortPlaylistsForBlindtest(
    dedupePlaylists(
      items
        .map((item) => toPlaylistSummary(item))
        .filter((value): value is SpotifyPlaylistSummary => value !== null),
    ),
  ).slice(0, safeLimit);
  if (fromSearch.length > 0) return fromSearch;

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
  if (featured.length > 0) return featured;

  return searchSpotifyPlaylistsViaWeb(query, safeLimit);
}

export async function fetchSpotifyPlaylistsForCategory(
  categoryId: string,
  limit = 20,
): Promise<SpotifyPlaylistSummary[]> {
  const normalizedCategoryId = categoryId.trim().toLowerCase();
  if (!normalizedCategoryId) return [];

  const token = await getSpotifyAccessToken();
  const safeLimit = Math.max(1, Math.min(limit, 50));
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

    if (categoryPlaylists.length > 0) return categoryPlaylists;
  }

  const category = spotifyPlaylistCategories().find((entry) => entry.id === normalizedCategoryId);
  const fallbackQuery = category?.query ?? normalizedCategoryId.replace(/[_-]+/g, " ");
  return searchSpotifyPlaylists(fallbackQuery, safeLimit);
}

export async function fetchSpotifyPopularPlaylists(limit = 20): Promise<SpotifyPlaylistSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const token = await getSpotifyAccessToken();
  const market = readSpotifyMarket();

  if (token) {
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

    if (featuredPlaylists.length > 0) return featuredPlaylists;
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

export async function fetchSpotifyPlaylistTracks(playlistId: string, limit = 20): Promise<MusicTrack[]> {
  const token = await getSpotifyAccessToken();
  if (!token) return [];

  const normalizedPlaylistId = normalizeSpotifyPlaylistId(playlistId);
  if (!normalizedPlaylistId) {
    logEvent("warn", "spotify_playlist_invalid_id", {
      playlistId,
    });
    return [];
  }

  const safeLimit = Math.max(1, Math.min(limit, 50));
  const fetchLimit = Math.min(100, Math.max(safeLimit * 5, safeLimit));
  const market = readSpotifyMarket();
  const endpointVariants = [
    {
      endpoint: "items",
      route: "playlist_items",
    },
    {
      endpoint: "tracks",
      route: "playlist_tracks_legacy",
    },
  ] as const;

  let items: SpotifyPlaylistTrackPayload["items"] = [];
  let endpointUsed: (typeof endpointVariants)[number]["endpoint"] | "none" = "none";

  for (const variant of endpointVariants) {
    const url = new URL(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(normalizedPlaylistId)}/${variant.endpoint}`,
    );
    url.searchParams.set("limit", String(fetchLimit));
    url.searchParams.set("market", market);

    const payload = (await fetchJsonWithTimeout(
      url,
      {
        headers: { authorization: `Bearer ${token}` },
      },
      {
        context: {
          provider: "spotify",
          route: variant.route,
          playlistId: normalizedPlaylistId,
        },
      },
    )) as SpotifyPlaylistTrackPayload | null;

    if (Array.isArray(payload?.items)) {
      items = payload.items;
      endpointUsed = variant.endpoint;
      break;
    }
  }

  const deduped = items
    .map((item) => toTrack(item.item ?? item.track))
    .filter((value): value is MusicTrack => value !== null)
    .reduce<MusicTrack[]>((acc, track) => {
      const signature = `${track.title.toLowerCase()}::${track.artist.toLowerCase()}`;
      if (acc.some((value) => `${value.title.toLowerCase()}::${value.artist.toLowerCase()}` === signature)) {
        return acc;
      }
      acc.push(track);
      return acc;
    }, []);
  const previewBefore = deduped.filter((track) => Boolean(track.previewUrl)).length;
  const enriched = await enrichSpotifyTracksWithPreview(deduped, safeLimit);
  const previewAfter = enriched.filter((track) => Boolean(track.previewUrl)).length;
  logEvent("info", "spotify_playlist_preview_coverage", {
    playlistId: normalizedPlaylistId,
    market,
    endpointUsed,
    requestedLimit: safeLimit,
    fetchedItems: items.length,
    dedupedCount: deduped.length,
    previewBefore,
    previewAfter,
  });
  return prioritizeByPreview(enriched, safeLimit);
}

export async function fetchSpotifyPopularTracks(limit = 20): Promise<MusicTrack[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const playlistIds = readPopularPlaylistIds();
  const merged: MusicTrack[] = [];
  const seen = new Set<string>();

  for (const playlistId of playlistIds) {
    const tracks = await fetchSpotifyPlaylistTracks(playlistId, safeLimit);
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
