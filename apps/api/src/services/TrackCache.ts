import type { MusicTrack } from "./music-types";
import { resolveTrackPoolFromSource } from "./TrackSourceResolver";
import { logEvent } from "../lib/logger";
import { isTrackPlayable } from "./PlaybackSupport";

type TrackCacheEntry = {
  expiresAt: number;
  tracks: MusicTrack[];
};

export class TrackCache {
  private readonly entries = new Map<string, TrackCacheEntry>();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(private readonly ttlMs = 5 * 60_000) {}

  private key(categoryQuery: string) {
    return categoryQuery.toLowerCase();
  }

  async getOrBuild(categoryQuery: string, size: number) {
    const safeSize = Math.max(1, size);
    const cacheKey = this.key(categoryQuery);
    const now = Date.now();
    const existing = this.entries.get(cacheKey);

    if (existing && existing.expiresAt > now) {
      const cachedPlayableCount = existing.tracks.filter((track) => isTrackPlayable(track)).length;
      if (cachedPlayableCount <= 0) {
        this.entries.delete(cacheKey);
      } else {
        this.cacheHits += 1;
        if (existing.tracks.length >= safeSize) {
          return existing.tracks.slice(0, safeSize);
        }
      }
    }

    this.cacheMisses += 1;

    try {
      const tracks = await resolveTrackPoolFromSource({
        categoryQuery,
        size: safeSize,
      });
      const playableTrackCount = tracks.filter((track) => isTrackPlayable(track)).length;
      if (tracks.length > 0 && playableTrackCount > 0) {
        this.entries.set(cacheKey, {
          tracks,
          expiresAt: now + this.ttlMs,
        });
      } else {
        logEvent("warn", "track_cache_skip_store_unplayable", {
          cacheKey,
          categoryQuery,
          size: safeSize,
          trackCount: tracks.length,
          playableTrackCount,
        });
      }
      return tracks.slice(0, safeSize);
    } catch (error) {
      logEvent("error", "track_cache_build_failed", {
        cacheKey,
        categoryQuery,
        size: safeSize,
        hasStaleEntry: Boolean(existing),
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });

      if (existing) {
        return existing.tracks.slice(0, safeSize);
      }

      throw error;
    }
  }

  stats() {
    let totalCachedTracks = 0;
    for (const entry of this.entries.values()) {
      totalCachedTracks += entry.tracks.length;
    }
    return {
      entryCount: totalCachedTracks,
      keyCount: this.entries.size,
      ttlMs: this.ttlMs,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
    };
  }
}

export const trackCache = new TrackCache();
