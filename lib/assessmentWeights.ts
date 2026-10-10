/** Round to 4 decimals so 10 / 3 is stored as 3.3333 and three of them read as 10.00. */
export const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Show a weight with at most 2 decimals and no trailing zeros: 3.3333 -> "3.33", 10 -> "10". */
export const fmtPct = (n: number) => String(Math.round(n * 100) / 100);

/**
 * "Best K of N": only the best K items count toward the grade. Each item then carries target / K, so the best K add up to the target.
 * K is only used when it is smaller than the number of items.
 */
export function usableBestOf(k: number | null | undefined, count: number): number | null {
  return k && k >= 1 && k < count ? k : null;
}

/** What a category adds up to when only the best K count: the sum of all items scaled by K / N. */
export function effectiveSum(itemWeights: number[], k: number | null | undefined): number {
  const raw = itemWeights.reduce((s, w) => s + w, 0);
  const use = usableBestOf(k, itemWeights.length);
  return use ? (raw * use) / itemWeights.length : raw;
}

/** Per-item weight under best-of (used for lecture-plan coverage): each item contributes target / N, so the category still adds to the target. */
export function coverageWeight(marksPct: number, k: number | null | undefined, count: number): number {
  const use = usableBestOf(k, count);
  return use ? (marksPct * use) / count : marksPct;
}
