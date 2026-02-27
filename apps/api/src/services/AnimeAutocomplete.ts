import { pool } from "../db/client";

export type SuggestionRow = {
  animeId: number;
  canonical: string;
  alias: string;
  aliasType: "canonical" | "synonym" | "acronym";
  score: number;
};

export type AnimeSuggestion = {
  animeId: number;
  label: string;
  score: number;
  matchedAlias: string;
};

function isDbEnabled() {
  const value = process.env.DATABASE_URL;
  return typeof value === "string" && value.trim().length > 0;
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rankAnimeSuggestions(rows: SuggestionRow[], query: string) {
  const q = normalize(query);
  return rows
    .map((row) => {
      const alias = normalize(row.alias);
      const canonical = normalize(row.canonical);
      const rank = alias === q
        ? row.aliasType === "acronym" ? 0 : 1
        : canonical === q
          ? 2
          : alias.startsWith(q)
            ? row.aliasType === "acronym" ? 3 : 4
            : alias.includes(q)
              ? 5
              : 99;
      return {
        ...row,
        score: rank,
      };
    })
    .sort((left, right) => left.score - right.score);
}

export async function searchAnimeSuggestions(query: string, limit = 12): Promise<AnimeSuggestion[]> {
  const normalizedQuery = normalize(query);
  const safeLimit = Math.max(1, Math.min(limit, 40));
  if (normalizedQuery.length < 1) return [];

  let rows: SuggestionRow[] = [];

  if (isDbEnabled()) {
    const result = await pool.query<{
      anime_id: number;
      title_romaji: string;
      alias: string;
      alias_type: string;
    }>(
      `
        select
          aa.id as anime_id,
          aa.title_romaji,
          al.alias,
          al.alias_type
        from anime_catalog_alias al
        join anime_catalog_anime aa on aa.id = al.anime_id
        join anime_theme_videos tv on tv.anime_id = aa.id and tv.is_playable = true
        where al.normalized_alias like $1
           or al.normalized_alias like $2
        group by aa.id, aa.title_romaji, al.alias, al.alias_type
        limit $3
      `,
      [`${normalizedQuery}%`, `% ${normalizedQuery}%`, Math.max(80, safeLimit * 8)],
    );

    rows = result.rows.map((row) => ({
      animeId: row.anime_id,
      canonical: row.title_romaji,
      alias: row.alias,
      aliasType: row.alias_type === "acronym" ? "acronym" : row.alias_type === "synonym" ? "synonym" : "canonical",
      score: 0,
    } satisfies SuggestionRow));
  }

  const ranked = rankAnimeSuggestions(rows, normalizedQuery);
  const deduped = new Map<number, AnimeSuggestion>();

  for (const row of ranked) {
    if (row.score >= 99) continue;
    const existing = deduped.get(row.animeId);
    if (existing && existing.score <= row.score) continue;
    deduped.set(row.animeId, {
      animeId: row.animeId,
      label: row.canonical,
      score: row.score,
      matchedAlias: row.alias,
    });
    if (deduped.size >= safeLimit) break;
  }

  return [...deduped.values()].sort((left, right) => left.score - right.score).slice(0, safeLimit);
}
