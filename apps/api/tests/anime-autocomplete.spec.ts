import { describe, expect, it } from "vitest";
import { rankAnimeSuggestions } from "../src/services/AnimeAutocomplete";

describe("anime autocomplete", () => {
  it("ranks exact and acronym matches before fuzzy", () => {
    const ranked = rankAnimeSuggestions(
      [
        { animeId: 1, canonical: "Attack on Titan", alias: "aot", aliasType: "acronym", score: 0 },
        {
          animeId: 1,
          canonical: "Attack on Titan",
          alias: "attack on titan",
          aliasType: "canonical",
          score: 0,
        },
      ],
      "aot",
    );

    expect(ranked[0]?.canonical).toBe("Attack on Titan");
    expect(ranked[0]?.alias).toBe("aot");
  });
});
