type GameState = "waiting" | "countdown" | "playing" | "reveal" | "results";

export class RoomManager {
  private gameState: GameState = "waiting";
  private currentRound = 0;
  private roundDeadlineMs: number | null = null;
  private answers = new Map<string, string>();

  constructor(public readonly roomCode: string) {}

  state(): GameState {
    return this.gameState;
  }

  round(): number {
    return this.currentRound;
  }

  deadlineMs(): number | null {
    return this.roundDeadlineMs;
  }

  startGame() {
    if (this.gameState !== "waiting") return;
    this.currentRound = 0;
    this.roundDeadlineMs = null;
    this.gameState = "countdown";
  }

  forcePlayingRound(round: number, deadlineMs: number) {
    this.answers.clear();
    this.currentRound = round;
    this.roundDeadlineMs = deadlineMs;
    this.gameState = "playing";
  }

  submitAnswer(playerId: string, value: string) {
    if (this.gameState !== "playing") return { accepted: false as const };
    if (this.answers.has(playerId)) return { accepted: false as const };
    this.answers.set(playerId, value);
    return { accepted: true as const };
  }
}
