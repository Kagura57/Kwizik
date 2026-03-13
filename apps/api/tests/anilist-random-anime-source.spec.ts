import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRandomAniListAnimeIds } from "../src/services/AniListRandomAnimeSource";

type AniListRequest = {
  query?: string;
  variables?: {
    page?: number;
    perPage?: number;
    sort?: string[];
  };
};

const originalFetch = globalThis.fetch;

function mockAniListFetch(
  resolver: (request: AniListRequest, callIndex: number) => {
    ids: unknown[];
    hasNextPage?: boolean;
  },
) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse((init?.body as string) ?? "{}") as AniListRequest;
    const callIndex = fetchMock.mock.calls.length;
    const { ids, hasNextPage = true } = resolver(request, callIndex);

    return new Response(
      JSON.stringify({
        data: {
          Page: {
            pageInfo: {
              currentPage: request.variables?.page ?? 1,
              hasNextPage,
            },
            media: ids.map((id) => ({ id })),
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  });

  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    configurable: true,
    writable: true,
  });

  return fetchMock;
}

describe("AniListRandomAnimeSource", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it("returns fresh deduplicated AniList anime ids for each seed", async () => {
    mockAniListFetch((request) => {
      const page = request.variables?.page ?? 1;
      const base = page * 100;
      return {
        ids: [base + 1, base + 2, base + 1, base + 3],
      };
    });

    const first = await fetchRandomAniListAnimeIds({
      seed: "seed-a",
      desiredCount: 24,
      themeMode: "mix",
    });
    const second = await fetchRandomAniListAnimeIds({
      seed: "seed-b",
      desiredCount: 24,
      themeMode: "mix",
    });

    expect(first).not.toEqual(second);
    expect(new Set(first).size).toBe(first.length);
    expect(new Set(second).size).toBe(second.length);
  });

  it("deduplicates anime ids collected from multiple AniList pages", async () => {
    mockAniListFetch((_, callIndex) => {
      if (callIndex === 1) {
        return {
          ids: [11, 12, 13, 13],
          hasNextPage: true,
        };
      }

      return {
        ids: [13, 14, 12, 15],
        hasNextPage: false,
      };
    });

    const ids = await fetchRandomAniListAnimeIds({
      seed: "dedupe-seed",
      desiredCount: 5,
      themeMode: "op_only",
    });

    expect(ids).toEqual([11, 12, 13, 14, 15]);
  });

  it("keeps fetching until reaching the desired floor or exhausting AniList", async () => {
    const fetchMock = mockAniListFetch((_, callIndex) => {
      if (callIndex === 1) {
        return { ids: [101, 102], hasNextPage: true };
      }
      if (callIndex === 2) {
        return { ids: [103, 104], hasNextPage: true };
      }
      if (callIndex === 3) {
        return { ids: [105], hasNextPage: false };
      }
      return { ids: [], hasNextPage: false };
    });

    const reachedFloor = await fetchRandomAniListAnimeIds({
      seed: "floor-seed",
      desiredCount: 5,
      themeMode: "ed_only",
    });

    expect(reachedFloor).toEqual([101, 102, 103, 104, 105]);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);

    let exhaustedCalls = 0;
    mockAniListFetch(() => {
      exhaustedCalls += 1;
      return {
        ids: exhaustedCalls === 1 ? [201, 202, 203] : exhaustedCalls === 2 ? [203, 204] : [],
        hasNextPage: exhaustedCalls < 2,
      };
    });

    const exhausted = await fetchRandomAniListAnimeIds({
      seed: "exhausted-seed",
      desiredCount: 10,
      themeMode: "mix",
    });

    expect(exhausted).toEqual([201, 202, 203, 204]);
    expect(exhaustedCalls).toBeGreaterThanOrEqual(2);
  });

  it("does not reuse a prior selected anime pool between calls", async () => {
    mockAniListFetch(() => ({
      ids: [1, 2, 3, 4],
      hasNextPage: false,
    }));

    const first = await fetchRandomAniListAnimeIds({
      seed: "pool-seed",
      desiredCount: 4,
      themeMode: "mix",
    });

    mockAniListFetch(() => ({
      ids: [101, 102, 103, 104],
      hasNextPage: false,
    }));

    const second = await fetchRandomAniListAnimeIds({
      seed: "pool-seed",
      desiredCount: 4,
      themeMode: "mix",
    });

    expect(first).toEqual([1, 2, 3, 4]);
    expect(second).toEqual([101, 102, 103, 104]);
  });

  it("filters AniList media IDs to only positive finite integers", async () => {
    mockAniListFetch(() => ({
      ids: [0, -5, 1.5, "2", null, 7, 8],
      hasNextPage: false,
    }));

    const ids = await fetchRandomAniListAnimeIds({
      seed: "id-filter-seed",
      desiredCount: 7,
      themeMode: "mix",
    });

    expect(ids).toEqual([7, 8]);
  });
});
