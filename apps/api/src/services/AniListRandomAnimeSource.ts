import { logEvent } from "../lib/logger";
import { fetchJsonWithTimeout } from "../routes/music/http";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ANILIST_SLICE_SORTS = [
  ["POPULARITY_DESC"],
  ["TRENDING_DESC"],
  ["SCORE_DESC", "POPULARITY_DESC"],
  ["FAVOURITES_DESC", "POPULARITY_DESC"],
] as const;
const DEFAULT_PER_PAGE = 50;

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
      media?: Array<{ id?: number | null } | null>;
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
  const safeDesiredCount = Math.max(1, Math.min(desiredCount, 120));
  const maxPagesPerSlice = Math.max(2, Math.min(24, Math.ceil(safeDesiredCount / 8) + 3));
  const shuffledSorts = seededShuffle([...ANILIST_SLICE_SORTS], random);

  return shuffledSorts.map((sort, index): RequestSlice => ({
    sort,
    startPage: 1 + (hashSeed(`${seed}:${themeMode}:${index}`) % 12),
    maxPagesToFetch: maxPagesPerSlice,
  }));
}

export async function fetchRandomAniListAnimeIds(input: {
  seed: string;
  desiredCount: number;
  themeMode: "op_only" | "ed_only" | "mix";
}): Promise<number[]> {
  const safeDesiredCount = Math.max(1, Math.min(input.desiredCount, 120));
  const requestPlan = buildRequestPlan(input.seed, input.themeMode, safeDesiredCount);
  const uniqueIds: number[] = [];
  const seenIds = new Set<number>();
  const requestMemo = new Map<string, { ids: number[]; hasNextPage: boolean }>();
  let fetchedPageCount = 0;

  for (const [sliceIndex, slice] of requestPlan.entries()) {
    let page = slice.startPage;
    for (let depth = 0; depth < slice.maxPagesToFetch; depth += 1) {
      if (uniqueIds.length >= safeDesiredCount) break;

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
        const ids = (payload?.data?.Page?.media ?? [])
          .map((entry) => entry?.id)
          .filter((id): id is number => typeof id === "number" && Number.isFinite(id));
        const hasNextPage = payload?.data?.Page?.pageInfo?.hasNextPage === true;
        const response = { ids, hasNextPage };
        requestMemo.set(requestKey, response);
        return response;
      })());

      for (const id of result.ids) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        uniqueIds.push(id);
        if (uniqueIds.length >= safeDesiredCount) break;
      }

      if (!result.hasNextPage) {
        break;
      }
      page += 1;
    }

    if (uniqueIds.length >= safeDesiredCount) break;
  }

  logEvent("info", "anilist_random_discovery_fetched", {
    seed: input.seed,
    themeMode: input.themeMode,
    desiredCount: safeDesiredCount,
    sliceCount: requestPlan.length,
    fetchedPageCount,
    uniqueAnimeIdCount: uniqueIds.length,
  });

  return uniqueIds;
}
