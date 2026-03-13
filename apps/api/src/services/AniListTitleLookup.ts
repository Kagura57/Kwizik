import { logEvent } from "../lib/logger";
import { fetchJsonWithTimeout } from "../routes/music/http";
import { normalizeAnimeText } from "./AnimeTextNormalization";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ANILIST_MEDIA_SEARCH_SELECTION = `
  title {
    romaji
    english
    native
    userPreferred
  }
  synonyms
  popularity
  seasonYear
  genres
`;

type AniListMediaSearchPayload = {
  data?: {
    [key: string]: AniListMediaNode | null | undefined;
  };
};

type AniListMediaNode = {
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  } | null;
  synonyms?: string[] | null;
  popularity?: number | null;
  seasonYear?: number | null;
  genres?: string[] | null;
};

export type AniListMediaMetadata = {
  englishTitle: string | null;
  popularity: number | null;
  year: number | null;
  genres: string[];
};

const mediaMetadataCache = new Map<string, AniListMediaMetadata | null>();

function metadataFromMedia(media: AniListMediaNode | null | undefined, normalizedSearch: string) {
  const title = media?.title;
  const matchesSearch = [
    title?.romaji,
    title?.native,
    title?.userPreferred,
    ...(media?.synonyms ?? []),
  ]
    .map((value) => normalizeAnimeText(value ?? ""))
    .filter((value) => value.length > 0)
    .includes(normalizedSearch);
  const englishTitle = media?.title?.english?.trim() ?? "";
  const popularity =
    typeof media?.popularity === "number" && Number.isFinite(media.popularity)
      ? Math.max(0, Math.round(media.popularity))
      : null;
  const year =
    typeof media?.seasonYear === "number" && Number.isFinite(media.seasonYear)
      ? Math.max(1900, Math.round(media.seasonYear))
      : null;
  const genres = Array.from(
    new Set(
      (media?.genres ?? [])
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  );

  return matchesSearch
    ? {
        englishTitle:
          englishTitle.length > 0 && normalizeAnimeText(englishTitle) !== normalizedSearch
            ? englishTitle
            : null,
        popularity,
        year,
        genres,
      }
    : null;
}

export async function fetchAniListMediaMetadataBySearchBatch(searchTitles: string[]) {
  const normalizedEntries = Array.from(
    new Map(
      searchTitles
        .map((searchTitle) => {
          const normalizedSearch = normalizeAnimeText(searchTitle);
          return normalizedSearch.length > 0 ? [normalizedSearch, searchTitle] : null;
        })
        .filter((entry): entry is [string, string] => entry !== null),
    ).entries(),
  ).map(([normalizedSearch, searchTitle]) => ({ normalizedSearch, searchTitle }));

  const uncachedEntries = normalizedEntries.filter(
    (entry) => !mediaMetadataCache.has(entry.normalizedSearch),
  );

  if (uncachedEntries.length > 0) {
    const variableDeclarations = uncachedEntries.map((_, index) => `$search${index}: String`).join(", ");
    const queryBody = uncachedEntries
      .map(
        (_, index) => `
        ${uncachedEntries.length === 1 ? "Media" : `media${index}`}: Media(search: $search${index}, type: ANIME) {
          ${ANILIST_MEDIA_SEARCH_SELECTION}
        }`,
      )
      .join("\n");
    const variables = Object.fromEntries(
      uncachedEntries.map((entry, index) => [`search${index}`, entry.searchTitle]),
    );

    try {
      const payload = (await fetchJsonWithTimeout(
        ANILIST_GRAPHQL_URL,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            query: `query (${variableDeclarations}) {${queryBody}\n}`,
            variables,
          }),
        },
        {
          timeoutMs: 5_000,
          retries: 1,
          retryDelayMs: 250,
          maxRetryAfterMs: 2_000,
          maxTotalRetryMs: 6_000,
          context: {
            provider: "anilist",
            route: "media_search_metadata_batch",
            searchCount: uncachedEntries.length,
          },
        },
      )) as AniListMediaSearchPayload | null;

      for (const [index, entry] of uncachedEntries.entries()) {
        const key = uncachedEntries.length === 1 ? "Media" : `media${index}`;
        const media = payload?.data?.[key] as AniListMediaNode | null | undefined;
        mediaMetadataCache.set(entry.normalizedSearch, metadataFromMedia(media, entry.normalizedSearch));
      }
    } catch (error) {
      logEvent("warn", "anilist_media_metadata_batch_lookup_failed", {
        searchCount: uncachedEntries.length,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
      for (const entry of uncachedEntries) {
        mediaMetadataCache.set(entry.normalizedSearch, null);
      }
    }
  }

  const results = new Map<string, AniListMediaMetadata | null>();
  for (const searchTitle of searchTitles) {
    const normalizedSearch = normalizeAnimeText(searchTitle);
    results.set(searchTitle, normalizedSearch.length > 0 ? (mediaMetadataCache.get(normalizedSearch) ?? null) : null);
  }
  return results;
}

export async function fetchAniListEnglishTitleBySearch(searchTitle: string) {
  const metadata = await fetchAniListMediaMetadataBySearch(searchTitle);
  return metadata?.englishTitle ?? null;
}

export async function fetchAniListMediaMetadataBySearch(searchTitle: string) {
  return (await fetchAniListMediaMetadataBySearchBatch([searchTitle])).get(searchTitle) ?? null;
}
