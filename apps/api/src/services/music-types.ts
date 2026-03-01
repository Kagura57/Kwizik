export type MusicProvider = "spotify" | "deezer" | "apple-music" | "tidal" | "youtube" | "animethemes";

export type MusicTrack = {
  provider: MusicProvider;
  id: string;
  title: string;
  artist: string;
  songTitle?: string | null;
  songArtists?: string[] | null;
  durationSec?: number | null;
  previewUrl: string | null;
  sourceUrl: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  answer?: {
    canonical: string;
    englishTitle?: string | null;
    aliases?: string[];
  };
};

export type ProviderSearchFn = (query: string, limit: number) => Promise<MusicTrack[]>;
