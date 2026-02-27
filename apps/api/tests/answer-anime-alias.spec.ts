import { describe, expect, it } from "vitest";
import { isTextAnswerCorrect } from "../src/services/FuzzyMatcher";

describe("anime answer acceptance", () => {
  it("accepts acronym aliases", () => {
    expect(isTextAnswerCorrect("AOT", "Attack on Titan")).toBe(true);
    expect(isTextAnswerCorrect("SAO", "Sword Art Online")).toBe(true);
  });
});
