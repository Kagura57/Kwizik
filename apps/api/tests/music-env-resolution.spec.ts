import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as envModule from "../src/lib/env";
import { resetYouTubeSearchBackoffForTests, searchYouTube } from "../src/routes/music/youtube";

const readEnvVarMock = vi.fn<(key: string) => string | undefined>();

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("music env resolution", () => {
  const envKeys = ["YOUTUBE_API_KEY", "GOOGLE_API_KEY", "YT_API_KEY"] as const;
  const originalEnv = new Map<string, string | undefined>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    readEnvVarMock.mockReset();
    vi.spyOn(envModule, "readEnvVar").mockImplementation((key: string) => readEnvVarMock(key));
    resetYouTubeSearchBackoffForTests();
    for (const key of envKeys) {
      originalEnv.set(key, process.env[key]);
      process.env[key] = "";
    }
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    for (const key of envKeys) {
      const original = originalEnv.get(key);
      if (typeof original === "string") {
        process.env[key] = original;
      } else {
        delete process.env[key];
      }
    }
    originalEnv.clear();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("searchYouTube reads API key via readEnvVar", async () => {
    readEnvVarMock.mockImplementation((key) => (key === "YOUTUBE_API_KEY" ? "file-key" : undefined));
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: { videoId: "abc123" },
                snippet: { title: "Song", channelTitle: "Artist" },
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tracks = await searchYouTube("song artist", 1);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      provider: "youtube",
      id: "abc123",
      title: "Song",
      artist: "Artist",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg] = fetchMock.mock.calls[0] ?? [];
    expect(String(urlArg)).toContain("key=file-key");
  });

  it("returns the first api item without secondary video status validation", async () => {
    readEnvVarMock.mockImplementation((key) => (key === "YOUTUBE_API_KEY" ? "file-key" : undefined));
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: { videoId: "embeddable-fallback-1" },
                snippet: { title: "Fallback Song", channelTitle: "Fallback Artist" },
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tracks = await searchYouTube("fallback song artist", 1);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      provider: "youtube",
      id: "embeddable-fallback-1",
      title: "Fallback Song",
      artist: "Fallback Artist",
    });
  });

  it("returns first mappable youtube item when first raw item is invalid", async () => {
    readEnvVarMock.mockImplementation((key) => (key === "YOUTUBE_API_KEY" ? "file-key" : undefined));
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: {},
                snippet: { title: "Invalid Result", channelTitle: "Invalid Channel" },
              },
              {
                id: { videoId: "valid-youtube-id" },
                snippet: { title: "Valid Result", channelTitle: "Valid Channel" },
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tracks = await searchYouTube("valid fallback", 2);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      provider: "youtube",
      id: "valid-youtube-id",
      title: "Valid Result",
      artist: "Valid Channel",
    });
  });
});
