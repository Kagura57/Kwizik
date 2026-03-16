import { logEvent } from "../lib/logger";
import { fetchJsonWithTimeout } from "../routes/music/http";

export class AniListRemoteFailureError extends Error {
  constructor(public readonly failedFetchCount: number) {
    super(`AniList remote unavailable: ${failedFetchCount} fetch(es) failed`);
    this.name = "AniListRemoteFailureError";
  }
}

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ANILIST_SLICE_SORTS = [
  ["POPULARITY_DESC"],
  ["TRENDING_DESC"],
  ["SCORE_DESC", "POPULARITY_DESC"],
  ["FAVOURITES_DESC", "POPULARITY_DESC"],
] as const;
const DEFAULT_PER_PAGE = 50;
const MAX_PAGES_PER_SLICE = 24;
export const MAX_RANDOM_ANIME_DISCOVERY_IDS = DEFAULT_PER_PAGE * ANILIST_SLICE_SORTS.length * MAX_PAGES_PER_SLICE;

export type AniListRandomAnimeCandidate = {
  mediaId: number;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  synonyms: string[];
  popularity: number | null;
  year: number | null;
  genres: string[];
};

const RANDOM_ANILIST_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      currentPage
      hasNextPage
    }
    media(
      type: ANIME
      isAdult: false
      status_not: NOT_YET_RELEASED
      sort: $sort
    ) {
      id
      title {
        romaji
        english
        native
      }
      synonyms
      popularity
      seasonYear
      genres
    }
  }
}
`;

type AniListRandomPayload = {
  data?: {
    Page?: {
      pageInfo?: {
        hasNextPage?: boolean;
      };
      media?: Array<{
        id?: number | null;
        title?: {
          romaji?: string | null;
          english?: string | null;
          native?: string | null;
        } | null;
        synonyms?: string[] | null;
        popularity?: number | null;
        seasonYear?: number | null;
        genres?: string[] | null;
      } | null>;
    };
  };
};

type RequestSlice = {
  sort: readonly string[];
  startPage: number;
  maxPagesToFetch: number;
};

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(input: T[], random: () => number) {
  const copy = [...input];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }
  return copy;
}

function buildRequestPlan(seed: string, themeMode: "op_only" | "ed_only" | "mix", desiredCount: number) {
  const random = seededRandom(`${seed}:${themeMode}`);
  const safeDesiredCount = Math.max(1, Math.min(desiredCount, MAX_RANDOM_ANIME_DISCOVERY_IDS));
  const maxPagesPerSlice = Math.max(2, Math.min(MAX_PAGES_PER_SLICE, Math.ceil(safeDesiredCount / 8) + 3));
  const shuffledSorts = seededShuffle([...ANILIST_SLICE_SORTS], random);

  return shuffledSorts.map((sort, index): RequestSlice => ({
    sort,
    startPage: 1 + (hashSeed(`${seed}:${themeMode}:${index}`) % 12),
    maxPagesToFetch: maxPagesPerSlice,
  }));
}

function cleanOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function cleanStringList(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  );
}

function toCandidate(entry: NonNullable<NonNullable<AniListRandomPayload["data"]>["Page"]>["media"][number]) {
  const mediaId = entry?.id;
  if (!(typeof mediaId === "number" && Number.isFinite(mediaId) && Number.isInteger(mediaId) && mediaId > 0)) {
    return null;
  }

  return {
    mediaId,
    titleRomaji: cleanOptionalText(entry?.title?.romaji),
    titleEnglish: cleanOptionalText(entry?.title?.english),
    titleNative: cleanOptionalText(entry?.title?.native),
    synonyms: cleanStringList(entry?.synonyms),
    popularity:
      typeof entry?.popularity === "number" && Number.isFinite(entry.popularity)
        ? Math.max(0, Math.round(entry.popularity))
        : null,
    year:
      typeof entry?.seasonYear === "number" && Number.isFinite(entry.seasonYear)
        ? Math.max(1900, Math.round(entry.seasonYear))
        : null,
    genres: cleanStringList(entry?.genres),
  } satisfies AniListRandomAnimeCandidate;
}

export async function fetchRandomAniListAnimeCandidates(input: {
  seed: string;
  desiredCount: number;
  themeMode: "op_only" | "ed_only" | "mix";
}): Promise<AniListRandomAnimeCandidate[]> {
  const safeDesiredCount = Math.max(1, Math.min(input.desiredCount, MAX_RANDOM_ANIME_DISCOVERY_IDS));
  const requestPlan = buildRequestPlan(input.seed, input.themeMode, safeDesiredCount);
  const uniqueCandidates: AniListRandomAnimeCandidate[] = [];
  const seenIds = new Set<number>();
  const requestMemo = new Map<string, { candidates: AniListRandomAnimeCandidate[]; hasNextPage: boolean }>();
  let fetchedPageCount = 0;
  let failedFetchCount = 0;

  for (const [sliceIndex, slice] of requestPlan.entries()) {
    let page = slice.startPage;
    for (let depth = 0; depth < slice.maxPagesToFetch; depth += 1) {
      if (uniqueCandidates.length >= safeDesiredCount) break;

      const requestKey = `${sliceIndex}:${page}`;
      const cached = requestMemo.get(requestKey);
      const result = cached ?? (await (async () => {
        const payload = (await fetchJsonWithTimeout(
          ANILIST_GRAPHQL_URL,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              query: RANDOM_ANILIST_QUERY,
              variables: {
                page,
                perPage: DEFAULT_PER_PAGE,
                sort: slice.sort,
              },
            }),
          },
          {
            timeoutMs: 7_000,
            retries: 1,
            retryDelayMs: 300,
            maxTotalRetryMs: 8_000,
            context: {
              provider: "anilist",
              route: "random_anime_discovery",
              seed: input.seed,
              themeMode: input.themeMode,
              sliceIndex,
              page,
            },
          },
        )) as AniListRandomPayload | null;

        fetchedPageCount += 1;
        if (payload === null) {
          failedFetchCount += 1;
          const response = { candidates: [] as AniListRandomAnimeCandidate[], hasNextPage: false };
          requestMemo.set(requestKey, response);
          return response;
        }
        const candidates = (payload?.data?.Page?.media ?? [])
          .map((entry) => toCandidate(entry))
          .filter((entry): entry is AniListRandomAnimeCandidate => entry !== null);
        const hasNextPage = payload?.data?.Page?.pageInfo?.hasNextPage === true;
        const response = { candidates, hasNextPage };
        requestMemo.set(requestKey, response);
        return response;
      })());

      for (const candidate of result.candidates) {
        if (seenIds.has(candidate.mediaId)) continue;
        seenIds.add(candidate.mediaId);
        uniqueCandidates.push(candidate);
        if (uniqueCandidates.length >= safeDesiredCount) break;
      }

      if (!result.hasNextPage) {
        break;
      }
      page += 1;
    }

    if (uniqueCandidates.length >= safeDesiredCount) break;
  }

  logEvent("info", "anilist_random_discovery_fetched", {
    seed: input.seed,
    themeMode: input.themeMode,
    desiredCount: safeDesiredCount,
    sliceCount: requestPlan.length,
    fetchedPageCount,
    uniqueAnimeIdCount: uniqueCandidates.length,
    failedFetchCount,
  });

  if (uniqueCandidates.length === 0 && failedFetchCount > 0) {
    throw new AniListRemoteFailureError(failedFetchCount);
  }

  return uniqueCandidates;
}

export async function fetchRandomAniListAnimeIds(input: {
  seed: string;
  desiredCount: number;
  themeMode: "op_only" | "ed_only" | "mix";
}): Promise<number[]> {
  const candidates = await fetchRandomAniListAnimeCandidates(input);
  return candidates.map((candidate) => candidate.mediaId);
}
