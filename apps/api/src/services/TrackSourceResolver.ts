import { fetchAniListUsersOpeningTracks } from "../routes/music/anilist";
import { fetchDeezerChartTracks, fetchDeezerPlaylistTracks } from "../routes/music/deezer";
import { fetchSpotifyPlaylistTracks, fetchSpotifyPopularTracks } from "../routes/music/spotify";
import { searchYouTube } from "../routes/music/youtube";
import { logEvent } from "../lib/logger";
import type { MusicTrack } from "./music-types";
import { buildTrackPool } from "./MusicAggregator";

export type ParsedTrackSource =
  | {
      type: "search";
      original: string;
      query: string;
      payload: null;
    }
  | {
      type: "spotify_playlist";
      original: string;
      query: string;
      payload: { playlistId: string };
    }
  | {
      type: "spotify_popular";
      original: string;
      query: string;
      payload: null;
    }
  | {
      type: "deezer_playlist";
      original: string;
      query: string;
      payload: { playlistId: string };
    }
  | {
      type: "deezer_chart";
      original: string;
      query: string;
      payload: null;
    }
  | {
      type: "anilist_users";
      original: string;
      query: string;
      payload: { usernames: string[] };
    };

const SPOTIFY_PLAYLIST_PREFIX = "spotify:playlist:";
const SPOTIFY_POPULAR_PREFIX = "spotify:popular";
const DEEZER_PLAYLIST_PREFIX = "deezer:playlist:";
const DEEZER_CHART_PREFIX = "deezer:chart";
const ANILIST_USERS_PREFIX = "anilist:users:";

function parseUsers(raw: string) {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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
  const decoded = safeDecodeURIComponent(trimmed);
  const fromUri = decoded.match(/spotify:playlist:([a-zA-Z0-9]+)/i)?.[1];
  if (fromUri) return fromUri;
  const fromUrl = decoded.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/i)?.[1];
  if (fromUrl) return fromUrl;
  return decoded.replace(/[?#].*$/, "").trim();
}

function normalizeDeezerPlaylistId(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  const decoded = safeDecodeURIComponent(trimmed);
  const fromUrl = decoded.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/([0-9]+)/i)?.[1];
  if (fromUrl) return fromUrl;
  return decoded.replace(/[?#].*$/, "").trim();
}

export function parseTrackSource(categoryQuery: string): ParsedTrackSource {
  const trimmed = categoryQuery.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith(SPOTIFY_PLAYLIST_PREFIX)) {
    const playlistId = normalizeSpotifyPlaylistId(trimmed.slice(SPOTIFY_PLAYLIST_PREFIX.length));
    return {
      type: "spotify_playlist",
      original: categoryQuery,
      query: "",
      payload: { playlistId },
    };
  }

  if (lower === SPOTIFY_POPULAR_PREFIX) {
    return {
      type: "spotify_popular",
      original: categoryQuery,
      query: "",
      payload: null,
    };
  }

  if (lower.startsWith(DEEZER_PLAYLIST_PREFIX)) {
    const playlistId = normalizeDeezerPlaylistId(trimmed.slice(DEEZER_PLAYLIST_PREFIX.length));
    return {
      type: "deezer_playlist",
      original: categoryQuery,
      query: "",
      payload: { playlistId },
    };
  }

  if (lower === DEEZER_CHART_PREFIX) {
    return {
      type: "deezer_chart",
      original: categoryQuery,
      query: "",
      payload: null,
    };
  }

  if (lower.startsWith(ANILIST_USERS_PREFIX)) {
    const rawUsers = trimmed.slice(ANILIST_USERS_PREFIX.length);
    const usernames = parseUsers(rawUsers);
    return {
      type: "anilist_users",
      original: categoryQuery,
      query: "",
      payload: { usernames },
    };
  }

  return {
    type: "search",
    original: categoryQuery,
    query: trimmed,
    payload: null,
  };
}

type ResolveTrackPoolOptions = {
  categoryQuery: string;
  size: number;
};

const AD_TRACK_PATTERNS = [
  /\b(advert(?:isement|ising)?|ad\s*break|commercial)\b/i,
  /\b(pub|publicite|annonce|sponsor\w*)\b/i,
  /\bdeezer\s*(ads?|pub|advert)\b/i,
  /\b(this\s+app|download\s+app|free\s+music\s+alternative|best\s+free\s+music)\b/i,
  /\bspotify\b.*\b(app|alternative|free)\b/i,
  /\bheartify\b/i,
  /\bdeezer\s*session\b/i,
  /\ba\s+\w+\s+playlist\b/i,
  /\b(app\s+store|play\s+store|music\s+app)\b/i,
];

const MATCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "audio",
  "by",
  "feat",
  "featuring",
  "from",
  "music",
  "official",
  "officiel",
  "song",
  "the",
  "video",
  "with",
]);

function normalizeAdText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyAdTrack(track: Pick<MusicTrack, "title" | "artist">) {
  const text = normalizeAdText(`${track.title} ${track.artist}`);
  return AD_TRACK_PATTERNS.some((pattern) => pattern.test(text));
}

function toMatchWords(value: string) {
  return normalizeAdText(value)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !MATCH_STOP_WORDS.has(word));
}

function overlapRatio(expected: string[], candidate: string[]) {
  if (expected.length <= 0 || candidate.length <= 0) return 0;
  const candidateSet = new Set(candidate);
  const matched = expected.filter((word) => candidateSet.has(word)).length;
  return matched / expected.length;
}

function randomShuffle<T>(values: T[]) {
  const copied = [...values];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copied[index];
    copied[index] = copied[swapIndex] as T;
    copied[swapIndex] = current as T;
  }
  return copied;
}

function nonEmptySlice(tracks: MusicTrack[], size: number) {
  const safeSize = Math.max(1, size);
  const sanitized = tracks.filter((track) => !isLikelyAdTrack(track));
  const shuffled = randomShuffle(sanitized);
  const withPreview = shuffled.filter((track) => Boolean(track.previewUrl));
  const withoutPreview = shuffled.filter((track) => !track.previewUrl);
  return [...withPreview, ...withoutPreview].slice(0, safeSize);
}

type YouTubeTrackCacheEntry = {
  track: MusicTrack;
  expiresAt: number;
};

const youtubeTrackCache = new Map<string, YouTubeTrackCacheEntry>();
const YOUTUBE_TRACK_CACHE_TTL_MS = 24 * 60 * 60_000;
const YOUTUBE_RESOLVE_BUDGET_MAX = 48;
const YOUTUBE_RESOLVE_BUDGET_MIN = 1;
const YOUTUBE_RESOLVE_CONCURRENCY = 4;

function signature(track: Pick<MusicTrack, "title" | "artist">) {
  return `${track.title.trim().toLowerCase()}::${track.artist.trim().toLowerCase()}`;
}

function scoreYouTubeCandidate(
  source: Pick<MusicTrack, "title" | "artist">,
  candidate: Pick<MusicTrack, "title" | "artist">,
) {
  const expectedTitle = normalizeAdText(source.title);
  const expectedArtist = normalizeAdText(source.artist);
  const candidateTitle = normalizeAdText(candidate.title);
  const candidateArtist = normalizeAdText(candidate.artist);
  const candidateCombined = `${candidateTitle} ${candidateArtist}`.trim();
  const expectedTitleWords = toMatchWords(source.title);
  const expectedArtistWords = toMatchWords(source.artist);
  const candidateTitleWords = toMatchWords(candidate.title);
  const candidateCombinedWords = toMatchWords(`${candidate.title} ${candidate.artist}`);

  let score = 0;
  if (expectedTitle === candidateTitle) score += 8;
  else if (expectedTitle.includes(candidateTitle) || candidateTitle.includes(expectedTitle)) score += 5;
  const titleOverlap = overlapRatio(expectedTitleWords, candidateTitleWords);
  score += Math.round(titleOverlap * 4);

  const artistContains =
    expectedArtist.length > 0 &&
    (candidateCombined.includes(expectedArtist) || expectedArtist.includes(candidateArtist));
  if (expectedArtist === candidateArtist) score += 6;
  else if (artistContains) score += 4;
  const artistOverlap = overlapRatio(expectedArtistWords, candidateCombinedWords);
  score += Math.round(artistOverlap * 3);

  const titleMatched =
    expectedTitle.length > 0 &&
    (expectedTitle === candidateTitle ||
      expectedTitle.includes(candidateTitle) ||
      candidateTitle.includes(expectedTitle) ||
      titleOverlap >= 0.45);
  const artistMatched =
    expectedArtist.length <= 0 || expectedArtist === candidateArtist || artistContains || artistOverlap >= 0.34;

  return {
    score,
    titleOverlap,
    artistOverlap,
    titleMatched,
    artistMatched,
  };
}

function isYouTubeLikeTrack(track: Pick<MusicTrack, "provider" | "sourceUrl">) {
  if (track.provider === "youtube") return true;
  const source = track.sourceUrl?.toLowerCase() ?? "";
  return source.includes("youtube.com/watch") || source.includes("youtu.be/");
}

function dedupeTracks(tracks: MusicTrack[], size: number) {
  const seen = new Set<string>();
  const result: MusicTrack[] = [];

  for (const track of tracks) {
    if (result.length >= size) break;
    const key = `${track.id.toLowerCase()}::${signature(track)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }

  return result;
}

async function searchPlayableYouTube(query: string, limit: number): Promise<MusicTrack[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const youtube = await searchYouTube(query, safeLimit);
  return dedupeTracks(youtube, safeLimit);
}

async function resolveYouTubePlayback(track: MusicTrack) {
  if (isLikelyAdTrack(track)) return null;

  if (isYouTubeLikeTrack(track)) {
    return {
      ...track,
      provider: "youtube",
      sourceUrl: track.sourceUrl ?? `https://www.youtube.com/watch?v=${track.id}`,
      previewUrl: null,
    } satisfies MusicTrack;
  }

  const key = signature(track);
  const cached = youtubeTrackCache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.track;
    }
    youtubeTrackCache.delete(key);
  }

  const candidateMap = new Map<string, MusicTrack>();
  const queryVariants = Array.from(
    new Set(
      [
        `${track.title} ${track.artist} official audio`,
        `${track.artist} ${track.title}`,
      ]
        .map((query) => query.trim())
        .filter((query) => query.length > 0),
    ),
  );

  for (const query of queryVariants) {
    const candidates = await searchPlayableYouTube(query, 5);
    for (const candidate of candidates) {
      if (isLikelyAdTrack(candidate)) continue;
      const key = candidate.id.trim().toLowerCase();
      if (key.length <= 0 || candidateMap.has(key)) continue;
      candidateMap.set(key, candidate);
    }
  }

  const picked = [...candidateMap.values()]
    .map((candidate) => ({
      candidate,
      ...scoreYouTubeCandidate(track, candidate),
    }))
    .filter((candidate) => candidate.titleMatched && candidate.artistMatched)
    .sort((left, right) => {
      const byScore = right.score - left.score;
      if (byScore !== 0) return byScore;
      return right.titleOverlap - left.titleOverlap;
    })[0];

  const selected =
    picked && (
      picked.score >= 5 ||
      (picked.score >= 4 && picked.titleOverlap >= 0.6 && picked.artistOverlap >= 0.2)
    )
      ? picked.candidate
      : null;
  const resolved = selected
    ? ({
        provider: "youtube",
        id: selected.id,
        title: track.title,
        artist: track.artist,
        previewUrl: null,
        sourceUrl: selected.sourceUrl ?? `https://www.youtube.com/watch?v=${selected.id}`,
      } satisfies MusicTrack)
    : null;

  if (resolved) {
    youtubeTrackCache.set(key, {
      track: resolved,
      expiresAt: Date.now() + YOUTUBE_TRACK_CACHE_TTL_MS,
    });
  }
  return resolved;
}

async function prioritizeYouTubePlayback(
  tracks: MusicTrack[],
  size: number,
  input: { fillQuery: string; allowQueryFill: boolean },
) {
  const safeSize = Math.max(1, size);
  const scoped = nonEmptySlice(tracks, Math.max(safeSize * 3, safeSize));
  const result: MusicTrack[] = [];
  const seen = new Set<string>();
  let youtubeResolved = 0;
  let queryResolved = 0;
  let directResolveAttempts = 0;

  const remaining = Math.max(0, safeSize - result.length);
  const resolveBudget = Math.min(
    scoped.length,
    Math.max(
      YOUTUBE_RESOLVE_BUDGET_MIN,
      Math.min(YOUTUBE_RESOLVE_BUDGET_MAX, Math.max(safeSize * 2, remaining * 4)),
    ),
  );
  const candidates = scoped.slice(0, resolveBudget);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(YOUTUBE_RESOLVE_CONCURRENCY, candidates.length) }, async () => {
      while (result.length < safeSize) {
        const index = cursor;
        cursor += 1;
        const track = candidates[index];
        if (!track) break;
        const key = signature(track);
        if (seen.has(key)) continue;
        seen.add(key);

        directResolveAttempts += 1;
        const youtubePlayback = await resolveYouTubePlayback(track);
        if (youtubePlayback) {
          youtubeResolved += 1;
          result.push(youtubePlayback);
        }
      }
    }),
  );

  if (input.allowQueryFill && result.length < safeSize && input.fillQuery.trim().length > 0) {
    const fillQueries = Array.from(
      new Set(
        [input.fillQuery, `${input.fillQuery} official audio`]
          .map((query) => query.trim())
          .filter((query) => query.length > 0),
      ),
    );
    for (const query of fillQueries) {
      if (result.length >= safeSize) break;
      const candidates = await searchPlayableYouTube(query, Math.min(10, safeSize));
      for (const track of candidates) {
        if (result.length >= safeSize) break;
        if (isLikelyAdTrack(track)) continue;
        const key = signature(track);
        if (seen.has(key)) continue;
        seen.add(key);
        queryResolved += 1;
        result.push(track);
      }
    }
  }

  logEvent("info", "track_source_youtube_priority", {
    requestedSize: safeSize,
    inputCount: tracks.length,
    outputCount: result.length,
    youtubeResolved,
    queryResolved,
    directResolveAttempts,
    resolveBudget,
    droppedNonYoutubeCount: Math.max(0, tracks.length - youtubeResolved),
  });

  return result.slice(0, safeSize);
}

function fillQueryForParsedSource(parsed: ParsedTrackSource) {
  if (parsed.type === "search") return parsed.query;
  return "";
}

export async function resolveTrackPoolFromSource(
  options: ResolveTrackPoolOptions,
): Promise<MusicTrack[]> {
  const safeSize = Math.max(1, Math.min(options.size, 50));
  const parsed = parseTrackSource(options.categoryQuery);

  try {
    if (parsed.type === "spotify_playlist" && parsed.payload) {
      const tracks = await fetchSpotifyPlaylistTracks(
        parsed.payload.playlistId,
        500,
      );
      if (tracks.length > 0) {
        const prioritized = await prioritizeYouTubePlayback(
          tracks,
          safeSize,
          {
            fillQuery: fillQueryForParsedSource(parsed),
            allowQueryFill: parsed.type === "search",
          },
        );
        if (prioritized.length > 0) return prioritized;
        logEvent("warn", "track_source_priority_empty_fallback", {
          sourceType: parsed.type,
          categoryQuery: options.categoryQuery,
          requestedSize: safeSize,
          inputCount: tracks.length,
        });
      }
      logEvent("warn", "track_source_empty_fallback", {
        sourceType: parsed.type,
        categoryQuery: options.categoryQuery,
        requestedSize: safeSize,
      });
      return [];
    }

    if (parsed.type === "spotify_popular") {
      const tracks = await fetchSpotifyPopularTracks(Math.min(50, Math.max(safeSize * 3, safeSize)));
      if (tracks.length > 0) {
        const prioritized = await prioritizeYouTubePlayback(
          tracks,
          safeSize,
          {
            fillQuery: fillQueryForParsedSource(parsed),
            allowQueryFill: parsed.type === "search",
          },
        );
        if (prioritized.length > 0) return prioritized;
        logEvent("warn", "track_source_priority_empty_fallback", {
          sourceType: parsed.type,
          categoryQuery: options.categoryQuery,
          requestedSize: safeSize,
          inputCount: tracks.length,
        });
      }
      logEvent("warn", "track_source_empty_fallback", {
        sourceType: parsed.type,
        categoryQuery: options.categoryQuery,
        requestedSize: safeSize,
      });
      return [];
    }

    if (parsed.type === "deezer_playlist" && parsed.payload) {
      const tracks = await fetchDeezerPlaylistTracks(parsed.payload.playlistId, 500);
      if (tracks.length > 0) {
        const prioritized = await prioritizeYouTubePlayback(
          tracks,
          safeSize,
          {
            fillQuery: fillQueryForParsedSource(parsed),
            allowQueryFill: parsed.type === "search",
          },
        );
        if (prioritized.length > 0) return prioritized;
        logEvent("warn", "track_source_priority_empty_fallback", {
          sourceType: parsed.type,
          categoryQuery: options.categoryQuery,
          requestedSize: safeSize,
          inputCount: tracks.length,
        });
      }
      logEvent("warn", "track_source_empty_fallback", {
        sourceType: parsed.type,
        categoryQuery: options.categoryQuery,
        requestedSize: safeSize,
      });
      return [];
    }

    if (parsed.type === "deezer_chart") {
      const tracks = await fetchDeezerChartTracks(Math.min(50, Math.max(safeSize * 3, safeSize)));
      if (tracks.length > 0) {
        const prioritized = await prioritizeYouTubePlayback(
          tracks,
          safeSize,
          {
            fillQuery: fillQueryForParsedSource(parsed),
            allowQueryFill: parsed.type === "search",
          },
        );
        if (prioritized.length > 0) return prioritized;
        logEvent("warn", "track_source_priority_empty_fallback", {
          sourceType: parsed.type,
          categoryQuery: options.categoryQuery,
          requestedSize: safeSize,
          inputCount: tracks.length,
        });
      }
      logEvent("warn", "track_source_empty_fallback", {
        sourceType: parsed.type,
        categoryQuery: options.categoryQuery,
        requestedSize: safeSize,
      });
      return [];
    }

    if (parsed.type === "anilist_users" && parsed.payload) {
      const tracks = await fetchAniListUsersOpeningTracks(
        parsed.payload.usernames,
        Math.min(50, Math.max(safeSize * 3, safeSize)),
      );
      if (tracks.length > 0) {
        const prioritized = await prioritizeYouTubePlayback(
          tracks,
          safeSize,
          {
            fillQuery: fillQueryForParsedSource(parsed),
            allowQueryFill: parsed.type === "search",
          },
        );
        if (prioritized.length > 0) return prioritized;
        logEvent("warn", "track_source_priority_empty_fallback", {
          sourceType: parsed.type,
          categoryQuery: options.categoryQuery,
          requestedSize: safeSize,
          inputCount: tracks.length,
        });
      }
      logEvent("warn", "track_source_empty_fallback", {
        sourceType: parsed.type,
        categoryQuery: options.categoryQuery,
        requestedSize: safeSize,
      });
      return [];
    }

    const fallbackTracks = await buildTrackPool(parsed.query, safeSize);
    return prioritizeYouTubePlayback(fallbackTracks, safeSize, {
      fillQuery: fillQueryForParsedSource(parsed),
      allowQueryFill: parsed.type === "search",
    });
  } catch (error) {
    logEvent("warn", "track_source_resolution_failed", {
      sourceType: parsed.type,
      categoryQuery: options.categoryQuery,
      requestedSize: safeSize,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });

    if (parsed.type !== "search") {
      return [];
    }

    const fallbackTracks = await buildTrackPool(parsed.query, safeSize);
    return prioritizeYouTubePlayback(fallbackTracks, safeSize, {
      fillQuery: fillQueryForParsedSource(parsed),
      allowQueryFill: true,
    });
  }
}
