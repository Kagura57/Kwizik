export type MusicProvider = "spotify" | "deezer" | "apple-music" | "tidal" | "youtube" | "animethemes";

export type MusicTrack = {
  provider: MusicProvider;
  id: string;
  title: string;
  artist: string;
  durationSec?: number | null;
  previewUrl: string | null;
  sourceUrl: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  answer?: {
    canonical: string;
  };
};

export type ProviderSearchFn = (query: string, limit: number) => Promise<MusicTrack[]>;
