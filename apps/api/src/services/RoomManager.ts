type GameState = "waiting" | "countdown" | "playing" | "reveal" | "results";

export class RoomManager {
  private gameState: GameState = "waiting";
  private answers = new Map<string, string>();

  constructor(public readonly roomCode: string) {}

  state(): GameState {
    return this.gameState;
  }

  startGame() {
    if (this.gameState !== "waiting") return;
    this.gameState = "countdown";
  }

  forcePlayingRound(_round: number, _deadlineMs: number) {
    this.answers.clear();
    this.gameState = "playing";
  }

  submitAnswer(playerId: string, value: string) {
    if (this.gameState !== "playing") return { accepted: false as const };
    if (this.answers.has(playerId)) return { accepted: false as const };
    this.answers.set(playerId, value);
    return { accepted: true as const };
  }
}
