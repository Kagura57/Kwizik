import { describe, expect, it } from "vitest";
import { createGameStore } from "../stores/gameStore";

describe("web skeleton", () => {
  it("creates a game store with initial state", () => {
    const store = createGameStore();
    expect(store.getState().isMuted).toBe(false);
  });
});
