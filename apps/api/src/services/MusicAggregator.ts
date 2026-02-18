import { searchSpotify } from "../routes/music/spotify";
import { searchDeezer } from "../routes/music/deezer";
import { searchAppleMusic } from "../routes/music/apple";
import { searchTidal } from "../routes/music/tidal";
import { searchYTMusic } from "../routes/music/ytmusic";
import { searchYouTube } from "../routes/music/youtube";

export type MusicProvider = "spotify" | "deezer" | "apple-music" | "tidal" | "ytmusic" | "youtube";

export type MusicTrack = {
  provider: MusicProvider;
  id: string;
  title: string;
  artist: string;
  previewUrl: string | null;
};

export async function unifiedMusicSearch(query: string, limit = 10) {
  const safeLimit = Math.max(1, Math.min(limit, 50));

  const providerResults = await Promise.allSettled([
    searchSpotify(query, safeLimit),
    searchDeezer(query, safeLimit),
    searchAppleMusic(query, safeLimit),
    searchTidal(query, safeLimit),
    searchYTMusic(query, safeLimit),
    searchYouTube(query, safeLimit),
  ]);

  return {
    query,
    limit: safeLimit,
    results: {
      spotify: providerResults[0].status === "fulfilled" ? providerResults[0].value : [],
      deezer: providerResults[1].status === "fulfilled" ? providerResults[1].value : [],
      "apple-music": providerResults[2].status === "fulfilled" ? providerResults[2].value : [],
      tidal: providerResults[3].status === "fulfilled" ? providerResults[3].value : [],
      ytmusic: providerResults[4].status === "fulfilled" ? providerResults[4].value : [],
      youtube: providerResults[5].status === "fulfilled" ? providerResults[5].value : [],
    },
  };
}

