type ApplyScoreInput = {
  isCorrect: boolean;
  responseMs: number;
  streak: number;
  baseScore: number;
};

const STREAK_MULTIPLIERS = [1, 1.1, 1.25, 1.5] as const;

export function applyScore(input: ApplyScoreInput) {
  if (!input.isCorrect) {
    return { earned: 0, nextStreak: 0, multiplier: 1 };
  }

  const nextStreak = input.streak + 1;
  const idx = Math.min(nextStreak - 1, STREAK_MULTIPLIERS.length - 1);
  const multiplier = STREAK_MULTIPLIERS[idx];
  const speedFactor = Math.max(0.5, 1 - input.responseMs / 20000);
  const earned = Math.round(input.baseScore * multiplier * speedFactor);

  return { earned, nextStreak, multiplier };
}
