import { describe, expect, it } from "vitest";
import { isTextAnswerCorrect } from "../src/services/FuzzyMatcher";

describe("anime answer acceptance", () => {
  it("accepts acronym aliases", () => {
    expect(isTextAnswerCorrect("AOT", "Attack on Titan")).toBe(true);
    expect(isTextAnswerCorrect("SAO", "Sword Art Online")).toBe(true);
    expect(isTextAnswerCorrect("FMA", "Fullmetal Alchemist: Brotherhood")).toBe(true);
  });

  it("accepts franchise base for season or subtitle variants", () => {
    expect(isTextAnswerCorrect("Attack on Titan", "Attack on Titan Season 3 Part 2")).toBe(true);
    expect(isTextAnswerCorrect("L'Attaque des Titans", "L'Attaque des Titans Saison 3")).toBe(true);
    expect(isTextAnswerCorrect("Naruto", "Naruto Shippuden")).toBe(true);
    expect(isTextAnswerCorrect("Naruto", "Naruto Shuppuden")).toBe(true);
  });

  it("accepts punctuation and apostrophe variants", () => {
    expect(isTextAnswerCorrect("hells paradise", "Hell's Paradise")).toBe(true);
    expect(isTextAnswerCorrect("hell's paradise", "Hells Paradise")).toBe(true);
    expect(isTextAnswerCorrect("jujutsu-kaisen", "Jujutsu Kaisen")).toBe(true);
  });

  it("keeps short noisy partials invalid", () => {
    expect(isTextAnswerCorrect("on", "Attack on Titan")).toBe(false);
    expect(isTextAnswerCorrect("of", "Fullmetal Alchemist")).toBe(false);
  });
});
