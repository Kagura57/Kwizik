import { logEvent } from "../../lib/logger";
import { refreshAnimeThemesCatalog } from "../AnimeThemesCatalogService";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let refreshTimer: NodeJS.Timeout | null = null;

function readCatalogRefreshIntervalMs() {
  const raw = process.env.ANIMETHEMES_REFRESH_INTERVAL_MS?.trim();
  if (!raw) return ONE_DAY_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return ONE_DAY_MS;
  return Math.max(60_000, parsed);
}

export function startAnimeThemesCatalogRefreshJob() {
  if (refreshTimer) return refreshTimer;

  const intervalMs = readCatalogRefreshIntervalMs();
  const maxPagesRaw = process.env.ANIMETHEMES_REFRESH_MAX_PAGES?.trim();
  const maxPages =
    typeof maxPagesRaw === "string" && maxPagesRaw.length > 0
      ? Number.parseInt(maxPagesRaw, 10)
      : undefined;

  const run = async () => {
    try {
      await refreshAnimeThemesCatalog({
        maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
      });
    } catch (error) {
      logEvent("warn", "animethemes_catalog_refresh_failed", {
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    }
  };

  void run();
  refreshTimer = setInterval(run, intervalMs);
  return refreshTimer;
}
