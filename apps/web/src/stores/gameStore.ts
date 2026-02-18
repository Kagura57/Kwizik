import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type GameSession = {
  roomCode: string | null;
  playerId: string | null;
  displayName: string;
  isHost: boolean;
  categoryQuery: string;
};

type GameState = {
  isMuted: boolean;
  session: GameSession;
  setMuted: (value: boolean) => void;
  setSession: (value: Partial<GameSession>) => void;
  clearSession: () => void;
};

const DEFAULT_SESSION: GameSession = {
  roomCode: null,
  playerId: null,
  displayName: "",
  isHost: false,
  categoryQuery: "popular hits",
};

export const createGameStore = () =>
  createStore<GameState>((set) => ({
    isMuted: false,
    session: DEFAULT_SESSION,
    setMuted: (value) => set({ isMuted: value }),
    setSession: (value) =>
      set((state) => ({
        session: { ...state.session, ...value },
      })),
    clearSession: () => set({ session: DEFAULT_SESSION }),
  }));

export const gameStore = createGameStore();

export function useGameStore<T>(selector: (state: GameState) => T) {
  return useStore(gameStore, selector);
}
