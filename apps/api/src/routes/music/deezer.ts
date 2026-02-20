import { fetchJsonWithTimeout } from "./http";
import type { MusicTrack } from "../../services/music-types";
import { readEnvVar } from "../../lib/env";
import { logEvent } from "../../lib/logger";

type DeezerPayload = {
  data?: Array<{
    id?: number;
    title?: string;
    duration?: number;
    artist?: { name?: string };
    preview?: string | null;
  }>;
  total?: number;
  next?: string;
};

type DeezerPlaylistPayload = {
  data?: Array<{
    id?: number;
    title?: string;
    description?: string | null;
    picture_medium?: string | null;
    link?: string | null;
    creator?: {
      name?: string;
    };
    nb_tracks?: number | null;
  }>;
};

export type DeezerPlaylistSummary = {
  provider: "deezer";
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  externalUrl: string;
  owner: string | null;
  trackCount: number | null;
};

function isDeezerEnabled() {
  const raw = readEnvVar("DEEZER_ENABLED");
  if (typeof raw !== "string") return true;
  return raw.trim().toLowerCase() !== "false";
}

export async function searchDeezer(query: string, limit = 10): Promise<MusicTrack[]> {
  const enabled = isDeezerEnabled();
  if (!enabled) return [];

  const url = new URL("https://api.deezer.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const payload = (await fetchJsonWithTimeout(url, {}, {
    context: {
      provider: "deezer",
      query,
    },
  })) as DeezerPayload | null;
  const items = payload?.data ?? [];

  return items
    .map((item) => {
      const id = item.id;
      const title = item.title?.trim();
      const artist = item.artist?.name?.trim();
      if (!id || !title || !artist) return null;
      const durationSec =
        typeof item.duration === "number" && Number.isFinite(item.duration)
          ? Math.max(1, Math.round(item.duration))
          : null;
      return {
        provider: "deezer" as const,
        id: String(id),
        title,
        artist,
        durationSec,
        previewUrl: item.preview ?? null,
        sourceUrl: `https://www.deezer.com/track/${id}`,
      };
    })
    .filter((value): value is MusicTrack => value !== null);
}

export async function fetchDeezerChartTracks(limit = 20): Promise<MusicTrack[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const url = new URL("https://api.deezer.com/chart/0/tracks");
  url.searchParams.set("limit", String(safeLimit));

  const payload = (await fetchJsonWithTimeout(url, {}, {
    context: {
      provider: "deezer",
      route: "chart_tracks",
    },
  })) as DeezerPayload | null;

  return (payload?.data ?? [])
    .map((item) => {
      const id = item.id;
      const title = item.title?.trim();
      const artist = item.artist?.name?.trim();
      if (!id || !title || !artist) return null;
      const durationSec =
        typeof item.duration === "number" && Number.isFinite(item.duration)
          ? Math.max(1, Math.round(item.duration))
          : null;
      return {
        provider: "deezer" as const,
        id: String(id),
        title,
        artist,
        durationSec,
        previewUrl: item.preview ?? null,
        sourceUrl: `https://www.deezer.com/track/${id}`,
      };
    })
    .filter((value): value is MusicTrack => value !== null)
    .slice(0, safeLimit);
}

export async function fetchDeezerPlaylistTracks(
  playlistId: string,
  limit = 20,
): Promise<MusicTrack[]> {
  const target = Math.max(1, Math.min(limit, 2_000));
  const pageSize = 100;
  const tracks: MusicTrack[] = [];
  const seen = new Set<string>();
  let pageCount = 0;
  let manualIndex = 0;
  let nextUrl: URL | null = new URL(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}/tracks`);
  nextUrl.searchParams.set("limit", String(pageSize));
  nextUrl.searchParams.set("index", "0");

  while (nextUrl && pageCount < 200) {
    pageCount += 1;
    const payload = (await fetchJsonWithTimeout(nextUrl, {}, {
      context: {
        provider: "deezer",
        route: "playlist_tracks",
        playlistId,
        page: pageCount,
      },
    })) as DeezerPayload | null;

    for (const item of payload?.data ?? []) {
      const id = item.id;
      const title = item.title?.trim();
      const artist = item.artist?.name?.trim();
      if (!id || !title || !artist) continue;
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      const durationSec =
        typeof item.duration === "number" && Number.isFinite(item.duration)
          ? Math.max(1, Math.round(item.duration))
          : null;
      tracks.push({
        provider: "deezer",
        id: key,
        title,
        artist,
        durationSec,
        previewUrl: item.preview ?? null,
        sourceUrl: `https://www.deezer.com/track/${id}`,
      });

      if (tracks.length >= target) {
        return tracks;
      }
    }

    if (typeof payload?.next === "string" && payload.next.trim().length > 0) {
      try {
        nextUrl = new URL(payload.next);
        manualIndex += pageSize;
      } catch {
        nextUrl = null;
      }
      continue;
    }

    const total = typeof payload?.total === "number" ? payload.total : null;
    if (total !== null && tracks.length < Math.min(total, target)) {
      manualIndex += pageSize;
      nextUrl = new URL(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}/tracks`);
      nextUrl.searchParams.set("limit", String(pageSize));
      nextUrl.searchParams.set("index", String(manualIndex));
    } else {
      nextUrl = null;
    }
  }

  return tracks;
}

function toDeezerPlaylistSummary(
  item: DeezerPlaylistPayload["data"] extends Array<infer T> ? T : never,
): DeezerPlaylistSummary | null {
  const id = item.id;
  const name = item.title?.trim();
  if (!id || !name) return null;
  return {
    provider: "deezer",
    id: String(id),
    name,
    description: item.description?.trim() ?? "",
    imageUrl: item.picture_medium ?? null,
    externalUrl: item.link?.trim() || `https://www.deezer.com/playlist/${id}`,
    owner: item.creator?.name?.trim() ?? null,
    trackCount: typeof item.nb_tracks === "number" ? item.nb_tracks : null,
  };
}

export async function searchDeezerPlaylists(
  query: string,
  limit = 20,
): Promise<DeezerPlaylistSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const url = new URL("https://api.deezer.com/search/playlist");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(safeLimit));

  const payload = (await fetchJsonWithTimeout(url, {}, {
    context: {
      provider: "deezer",
      route: "search_playlists",
      query: trimmed,
    },
  })) as DeezerPlaylistPayload | null;
  const rawItems = payload?.data;
  logEvent("info", "deezer_playlist_search_raw_payload", {
    query: trimmed,
    requestedLimit: safeLimit,
    dataType: Array.isArray(rawItems) ? "array" : typeof rawItems,
    itemCount: Array.isArray(rawItems) ? rawItems.length : 0,
    firstItemKeys: Array.isArray(rawItems) && rawItems[0] ? Object.keys(rawItems[0]).slice(0, 8) : [],
  });

  const seen = new Set<string>();
  const playlists: DeezerPlaylistSummary[] = [];
  for (const item of payload?.data ?? []) {
    const playlist = toDeezerPlaylistSummary(item);
    if (!playlist) continue;
    const key = playlist.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    playlists.push(playlist);
    if (playlists.length >= safeLimit) break;
  }

  logEvent("info", "deezer_playlist_search_mapped_payload", {
    query: trimmed,
    requestedLimit: safeLimit,
    mappedCount: playlists.length,
    firstMapped: playlists[0]
      ? {
          id: playlists[0].id,
          name: playlists[0].name,
          trackCount: playlists[0].trackCount,
        }
      : null,
  });

  return playlists;
}
