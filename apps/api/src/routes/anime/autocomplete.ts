import { Elysia } from "elysia";
import { logEvent } from "../../lib/logger";
import { searchAnimeSuggestions } from "../../services/AnimeAutocomplete";

function parseLimit(raw: string | undefined) {
  if (!raw) return 12;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 12;
  return Math.max(1, Math.min(parsed, 40));
}

export const animeAutocompleteRoutes = new Elysia({ prefix: "/anime" }).get(
  "/autocomplete",
  async ({ query, set }) => {
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const limit = parseLimit(typeof query.limit === "string" ? query.limit : undefined);

    if (!q) {
      set.status = 400;
      return { ok: false as const, error: "MISSING_QUERY" as const };
    }

    try {
      const suggestions = await searchAnimeSuggestions(q, limit);
      return {
        ok: true as const,
        q,
        suggestions,
      };
    } catch (error) {
      logEvent("warn", "anime_autocomplete_failed", {
        query: q,
        limit,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
      return {
        ok: true as const,
        q,
        suggestions: [],
      };
    }
  },
);
