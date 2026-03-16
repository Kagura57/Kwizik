import { describe, expect, it } from "vitest";
import {
  contentFilterSqlCondition,
  difficultySqlCondition,
  normalizeRoomContentFilters,
} from "../src/services/AniListRoomFilters";

describe("AniList room filters", () => {
  it("builds the easy popularity clause", () => {
    expect(difficultySqlCondition("easy")).toBe("and aa.anilist_popularity >= 100000");
  });

  it("builds the medium popularity clause", () => {
    expect(difficultySqlCondition("medium")).toBe(
      "and aa.anilist_popularity >= 30000 and aa.anilist_popularity < 100000",
    );
  });

  it("builds the hard popularity clause while excluding unknown popularity", () => {
    expect(difficultySqlCondition("hard")).toBe(
      "and aa.anilist_popularity is not null and aa.anilist_popularity < 30000",
    );
  });

  it("omits SQL when all difficulties are allowed", () => {
    expect(difficultySqlCondition("all")).toBe("");
  });

  it("normalizes content filters by deduping and keeping supported decades", () => {
    expect(
      normalizeRoomContentFilters({
        decades: [2010, 1990, 2010, 1980, Number.NaN],
        genres: ["Action", "Drama", "Action", "  "],
      }),
    ).toEqual({
      decades: [1990, 2010],
      genres: ["Action", "Drama"],
    });
  });

  it("builds SQL clauses for decade and genre filters", () => {
    expect(
      contentFilterSqlCondition(
        {
          decades: [1990, 2010],
          genres: ["Action", "Mystery"],
        },
        { startIndex: 3 },
      ),
    ).toEqual({
      sql:
        "and ((aa.year >= $3 and aa.year <= $4) or (aa.year >= $5 and aa.year <= $6))\n" +
        "              and aa.genres && $7::text[]",
      params: [1990, 1999, 2010, 2019, ["Action", "Mystery"]],
      nextIndex: 8,
    });
  });
});
