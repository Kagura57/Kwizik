import type { MusicTrack } from "./music-types";
import { buildTrackPool } from "./MusicAggregator";

type TrackCacheEntry = {
  expiresAt: number;
  tracks: MusicTrack[];
};

export class TrackCache {
  private readonly entries = new Map<string, TrackCacheEntry>();

  constructor(private readonly ttlMs = 5 * 60_000) {}

  private key(categoryQuery: string, size: number) {
    return `${categoryQuery.toLowerCase()}::${size}`;
  }

  async getOrBuild(categoryQuery: string, size: number) {
    const cacheKey = this.key(categoryQuery, size);
    const now = Date.now();
    const existing = this.entries.get(cacheKey);

    if (existing && existing.expiresAt > now) {
      return existing.tracks;
    }

    const tracks = await buildTrackPool(categoryQuery, size);
    this.entries.set(cacheKey, {
      tracks,
      expiresAt: now + this.ttlMs,
    });
    return tracks;
  }
}

export const trackCache = new TrackCache();
