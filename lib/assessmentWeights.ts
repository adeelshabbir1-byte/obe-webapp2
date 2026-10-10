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

/** Natural order for CLO codes: CLO-1, CLO-2 ... CLO-10 (not CLO-1, CLO-10, CLO-2). */
export const cloOrder = (a: { code: string }, b: { code: string }) => {
  const n = (c: string) => { const m = /(\d+)/.exec(c); return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER; };
  return n(a.code) - n(b.code) || a.code.localeCompare(b.code);
};

/** Adds the PLO each CLO maps to, and sorts so CLOs of the same PLO sit together (PLO 1 first; unmapped last). */
export async function closWithPlo(clos: { id: string; code: string; mappedPloId: string | null; ploContributionPct?: number | null }[]) {
  const { prisma } = await import("./db");
  const ids = Array.from(new Set(clos.map((c) => c.mappedPloId).filter((x): x is string => !!x)));
  const plos = ids.length ? await prisma.pLO.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, title: true } }) : [];
  const byId = new Map<string, { number: number; title: string }>(plos.map((p: { id: string; number: number; title: string }) => [p.id, p]));
  return clos
    .map((c) => ({ id: c.id, code: c.code, contribution: c.ploContributionPct ?? null, ploId: c.mappedPloId, ploNumber: c.mappedPloId ? byId.get(c.mappedPloId)?.number ?? null : null, ploTitle: c.mappedPloId ? byId.get(c.mappedPloId)?.title ?? "" : "" }))
    .sort((a, b) => (a.ploNumber ?? 9999) - (b.ploNumber ?? 9999) || cloOrder(a, b));
}

/**
 * Splits a percentage evenly into n parts that add up to exactly the total.
 * If it divides cleanly to two decimals it stays exact (10 over 4 -> 2.5 each; 50 over 8 -> 6.25 each);
 * otherwise each part is rounded to one decimal and the last item(s) take the remainder
 * (10 over 3 -> 3.3, 3.3, 3.4; 20 over 6 -> 3.3, 3.3, 3.3, 3.3, 3.4, 3.4).
 */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const hund = Math.round(total * 100);
  if (hund % n === 0) return Array.from({ length: n }, () => hund / n / 100);
  const tenthsTotal = Math.round(total * 10);
  if (Math.abs(tenthsTotal * 10 - hund) > 0) {
    // Total itself has two decimals (e.g. 12.25): fall back to hundredths, remainder on the last items.
    const base = Math.floor(hund / n), rem = hund - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i >= n - rem ? 1 : 0)) / 100);
  }
  const base = Math.floor(tenthsTotal / n), rem = tenthsTotal - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i >= n - rem ? 1 : 0)) / 10);
}
