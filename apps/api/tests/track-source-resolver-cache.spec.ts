import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchSpotifyPlaylistTracksMock = vi.fn();
const fetchSpotifyPopularTracksMock = vi.fn();
const fetchDeezerPlaylistTracksMock = vi.fn();
const fetchDeezerChartTracksMock = vi.fn();
const fetchAniListUsersOpeningTracksMock = vi.fn();
const searchYouTubeMock = vi.fn();
const searchYTMusicMock = vi.fn();
const buildTrackPoolMock = vi.fn();
const readEnvVarMock = vi.fn<(key: string) => string | undefined>();
const logEventMock = vi.fn();

vi.mock("../src/routes/music/anilist", () => ({
  fetchAniListUsersOpeningTracks: (...args: unknown[]) => fetchAniListUsersOpeningTracksMock(...args),
}));

vi.mock("../src/routes/music/deezer", () => ({
  fetchDeezerChartTracks: (...args: unknown[]) => fetchDeezerChartTracksMock(...args),
  fetchDeezerPlaylistTracks: (...args: unknown[]) => fetchDeezerPlaylistTracksMock(...args),
}));

vi.mock("../src/routes/music/spotify", () => ({
  fetchSpotifyPlaylistTracks: (...args: unknown[]) => fetchSpotifyPlaylistTracksMock(...args),
  fetchSpotifyPopularTracks: (...args: unknown[]) => fetchSpotifyPopularTracksMock(...args),
}));

vi.mock("../src/routes/music/youtube", () => ({
  searchYouTube: (...args: unknown[]) => searchYouTubeMock(...args),
}));

vi.mock("../src/routes/music/ytmusic", () => ({
  searchYTMusic: (...args: unknown[]) => searchYTMusicMock(...args),
}));

vi.mock("../src/services/MusicAggregator", () => ({
  buildTrackPool: (...args: unknown[]) => buildTrackPoolMock(...args),
}));

vi.mock("../src/lib/env", () => ({
  readEnvVar: (key: string) => readEnvVarMock(key),
}));

vi.mock("../src/lib/logger", () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
}));

import { resolveTrackPoolFromSource } from "../src/services/TrackSourceResolver";

describe("track source resolver cache behavior", () => {
  beforeEach(() => {
    fetchSpotifyPlaylistTracksMock.mockReset();
    fetchSpotifyPopularTracksMock.mockReset();
    fetchDeezerPlaylistTracksMock.mockReset();
    fetchDeezerChartTracksMock.mockReset();
    fetchAniListUsersOpeningTracksMock.mockReset();
    searchYouTubeMock.mockReset();
    searchYTMusicMock.mockReset();
    buildTrackPoolMock.mockReset();
    readEnvVarMock.mockReset();
    logEventMock.mockReset();

    readEnvVarMock.mockReturnValue(undefined);
    fetchSpotifyPlaylistTracksMock.mockResolvedValue([
      {
        provider: "spotify",
        id: "sp-cache-1",
        title: "Cache Song",
        artist: "Cache Artist",
        previewUrl: "https://cdn.example/cache.mp3",
        sourceUrl: "https://open.spotify.com/track/sp-cache-1",
      },
    ]);
    fetchSpotifyPopularTracksMock.mockResolvedValue([]);
    fetchDeezerPlaylistTracksMock.mockResolvedValue([]);
    fetchDeezerChartTracksMock.mockResolvedValue([]);
    fetchAniListUsersOpeningTracksMock.mockResolvedValue([]);
    buildTrackPoolMock.mockResolvedValue([]);
    searchYTMusicMock.mockResolvedValue([]);
  });

  it("does not cache failed youtube resolutions as permanent null", async () => {
    let youtubeCalls = 0;
    searchYouTubeMock.mockImplementation(async () => {
      youtubeCalls += 1;
      if (youtubeCalls <= 7) return [];
      return [
        {
          provider: "youtube",
          id: "yt-cache-1",
          title: "Cache Song official audio",
          artist: "Cache Artist topic",
          previewUrl: null,
          sourceUrl: "https://www.youtube.com/watch?v=yt-cache-1",
        },
      ];
    });

    const first = await resolveTrackPoolFromSource({
      categoryQuery: "spotify:playlist:cache123",
      size: 1,
    });
    expect(first).toHaveLength(0);

    const second = await resolveTrackPoolFromSource({
      categoryQuery: "spotify:playlist:cache123",
      size: 1,
    });
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      provider: "youtube",
      id: "yt-cache-1",
    });
  });

  it("filters ad-like source tracks before youtube prioritization", async () => {
    fetchSpotifyPlaylistTracksMock.mockResolvedValue([
      {
        provider: "spotify",
        id: "sp-ad-1",
        title: "Annonce Publicitaire",
        artist: "Deezer Ads",
        previewUrl: "https://cdn.example/ad.mp3",
        sourceUrl: "https://open.spotify.com/track/sp-ad-1",
      },
      {
        provider: "spotify",
        id: "sp-real-1",
        title: "Real Song",
        artist: "Real Artist",
        previewUrl: "https://cdn.example/real.mp3",
        sourceUrl: "https://open.spotify.com/track/sp-real-1",
      },
    ]);

    searchYouTubeMock.mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes("real song")) {
        return [
          {
            provider: "youtube",
            id: "yt-real-1",
            title: "Real Song (Official Audio)",
            artist: "Real Artist",
            previewUrl: null,
            sourceUrl: "https://www.youtube.com/watch?v=yt-real-1",
          },
        ];
      }

      if (query.toLowerCase().includes("annonce")) {
        return [
          {
            provider: "youtube",
            id: "yt-ad-1",
            title: "Publicite",
            artist: "Ads Channel",
            previewUrl: null,
            sourceUrl: "https://www.youtube.com/watch?v=yt-ad-1",
          },
        ];
      }

      return [];
    });

    const resolved = await resolveTrackPoolFromSource({
      categoryQuery: "spotify:playlist:cache123",
      size: 2,
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      provider: "youtube",
      id: "yt-real-1",
      title: "Real Song",
      artist: "Real Artist",
    });
  });
});
