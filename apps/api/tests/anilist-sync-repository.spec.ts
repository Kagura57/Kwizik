import { describe, expect, it } from "vitest";
import { userAnimeLibraryRepository } from "../src/repositories/UserAnimeLibraryRepository";

describe("user anime library repository", () => {
  it("replaces active rows using staged run atomically", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await userAnimeLibraryRepository.setStagingForRun({
        runId: 42,
        userId: "u_1",
        entries: [{ animeId: 1, listStatus: "WATCHING" }],
      });
      await userAnimeLibraryRepository.replaceFromStaging({ runId: 42, userId: "u_1" });
      const rows = await userAnimeLibraryRepository.listByUser("u_1", 10);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows[0]?.animeId).toBe(1);
    } finally {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
});
