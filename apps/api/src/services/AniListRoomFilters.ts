export type RoomDifficultyFilter = "all" | "easy" | "medium" | "hard";
export type RoomContentFilters = {
  decades: number[];
  genres: string[];
};

export const ANILIST_POPULARITY_THRESHOLDS = {
  easyMin: 100_000,
  mediumMin: 30_000,
} as const;
export const ROOM_CONTENT_FILTER_DECADES = [1990, 2000, 2010, 2020] as const;
export const ROOM_CONTENT_FILTER_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
] as const;
const ROOM_CONTENT_FILTER_DECADE_SET = new Set<number>(ROOM_CONTENT_FILTER_DECADES);

export function normalizeRoomContentFilters(input?: Partial<RoomContentFilters> | null): RoomContentFilters {
  const decades = Array.from(
    new Set(
      (input?.decades ?? [])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
        .map((value) => Math.floor(value))
        .filter((value) => ROOM_CONTENT_FILTER_DECADE_SET.has(value)),
    ),
  ).sort((left, right) => left - right);

  const genres = Array.from(
    new Set(
      (input?.genres ?? [])
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  ).slice(0, ROOM_CONTENT_FILTER_GENRES.length);

  return {
    decades,
    genres,
  };
}

export function difficultySqlCondition(filter: RoomDifficultyFilter, column = "aa.anilist_popularity") {
  if (filter === "easy") {
    return `and ${column} >= ${ANILIST_POPULARITY_THRESHOLDS.easyMin}`;
  }
  if (filter === "medium") {
    return (
      `and ${column} >= ${ANILIST_POPULARITY_THRESHOLDS.mediumMin} ` +
      `and ${column} < ${ANILIST_POPULARITY_THRESHOLDS.easyMin}`
    );
  }
  if (filter === "hard") {
    return `and ${column} is not null and ${column} < ${ANILIST_POPULARITY_THRESHOLDS.mediumMin}`;
  }
  return "";
}

export function contentFilterSqlCondition(
  filters: RoomContentFilters,
  options: {
    startIndex?: number;
    yearColumn?: string;
    genresColumn?: string;
  } = {},
) {
  const normalized = normalizeRoomContentFilters(filters);
  const yearColumn = options.yearColumn ?? "aa.year";
  const genresColumn = options.genresColumn ?? "aa.genres";
  let nextIndex = options.startIndex ?? 3;
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (normalized.decades.length > 0) {
    const decadeClauses: string[] = [];
    for (const decade of normalized.decades) {
      decadeClauses.push(`(${yearColumn} >= $${nextIndex} and ${yearColumn} <= $${nextIndex + 1})`);
      params.push(decade, decade + 9);
      nextIndex += 2;
    }
    clauses.push(`and (${decadeClauses.join(" or ")})`);
  }

  if (normalized.genres.length > 0) {
    clauses.push(`and ${genresColumn} && $${nextIndex}::text[]`);
    params.push(normalized.genres);
    nextIndex += 1;
  }

  return {
    sql: clauses.join("\n              "),
    params,
    nextIndex,
  };
}
