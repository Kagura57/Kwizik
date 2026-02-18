import { createStore } from "zustand/vanilla";

type GameState = { isMuted: boolean; setMuted: (value: boolean) => void };

export const createGameStore = () =>
  createStore<GameState>((set) => ({
    isMuted: false,
    setMuted: (value) => set({ isMuted: value }),
  }));
