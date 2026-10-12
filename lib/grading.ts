// Grade arithmetic, kept free of the database so it can be tested on its own (tests/grading.test.ts).

/** Class mean and sample standard deviation of total percentages (sd 0 with fewer than two students). */
export function classStats(totals: number[]) {
  const mean = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const variance = totals.length > 1 ? totals.reduce((s, t) => s + (t - mean) ** 2, 0) / (totals.length - 1) : 0;
  return { mean, sd: Math.sqrt(variance) };
}

/** Relative grading on mean and SD: A from mean+SD, B from mean, C from mean−SD, D from mean−2SD, else F. */
export function suggestedGrade(pct: number, mean: number, sd: number): string {
  if (pct >= mean + sd) return "A";
  if (pct >= mean) return "B";
  if (pct >= mean - sd) return "C";
  if (pct >= mean - 2 * sd) return "D";
  return "F";
}

/** The grade for a percentage: the saved cutoffs (highest first) when there are any, else the relative suggestion.
 * Below every cutoff the lowest saved letter applies. */
export function gradeWithCutoffs(pct: number, cutoffs: { letter: string; minPercent: number }[], mean: number, sd: number): string {
  if (!cutoffs.length) return suggestedGrade(pct, mean, sd);
  const sorted = [...cutoffs].sort((a, b) => b.minPercent - a.minPercent);
  const match = sorted.find((c) => pct >= c.minPercent);
  return match?.letter || sorted[sorted.length - 1]?.letter || suggestedGrade(pct, mean, sd);
}
