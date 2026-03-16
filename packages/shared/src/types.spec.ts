import { describe, expect, it } from "vitest";
import { GAME_STATES } from "./constants";
import type { RoundChoice, RoomPhase } from "./room";

describe("shared contracts", () => {
  it("includes required room states", () => {
    expect(GAME_STATES).toContain("waiting");
    expect(GAME_STATES).toContain("results");
  });

  it("exports room snapshot primitives", () => {
    const phase: RoomPhase = "playing";
    const choice: RoundChoice = {
      value: "Naruto - GO!!!",
      titleRomaji: "Naruto",
      titleEnglish: "Naruto",
      themeLabel: "GO!!!",
    };

    expect(phase).toBe("playing");
    expect(choice.titleEnglish).toBe("Naruto");
  });
});
