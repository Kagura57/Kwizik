export type MusicProvider = "spotify" | "deezer" | "apple-music" | "tidal" | "youtube";

export type MusicTrack = {
  provider: MusicProvider;
  id: string;
  title: string;
  artist: string;
  durationSec?: number | null;
  previewUrl: string | null;
  sourceUrl: string | null;
};

export type ProviderSearchFn = (query: string, limit: number) => Promise<MusicTrack[]>;
