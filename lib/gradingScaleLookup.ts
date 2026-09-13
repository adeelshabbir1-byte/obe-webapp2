import { prisma } from "./db";
import { termIndex } from "./termLogic";

/** Returns the grading scale actually in effect for a given batch — the
 * most recent version whose effective-from term is on or before that
 * batch's own start term. This is what lets a Coordinator introduce a new
 * scale (e.g. after an HEC policy change) that applies only to batches
 * starting from that point on, without silently reinterpreting grades
 * already awarded to earlier batches under the old scale. */
export async function getGradingScaleForBatch(coordinatorId: string, batch: { startTerm: string; startYear: number }) {
  const allScales = await prisma.gradingScale.findMany({ where: { coordinatorId }, orderBy: { orderIndex: "asc" } });
  if (allScales.length === 0) return [];

  const batchIndex = termIndex(batch.startTerm, batch.startYear);

  const versions = new Map<string, typeof allScales>();
  for (const s of allScales) {
    const key = `${s.effectiveFromTerm}::${s.effectiveFromYear}`;
    versions.set(key, [...(versions.get(key) || []), s]);
  }

  let bestKey: string | null = null;
  let bestIndex = -Infinity;
  for (const key of versions.keys()) {
    const [term, yearStr] = key.split("::");
    const idx = termIndex(term, parseInt(yearStr, 10));
    if (idx <= batchIndex && idx > bestIndex) { bestIndex = idx; bestKey = key; }
  }

  // No version is old enough for this batch (e.g. batch predates every
  // scale on record) — fall back to the earliest version available rather
  // than returning nothing.
  if (!bestKey) {
    let earliestKey: string | null = null, earliestIndex = Infinity;
    for (const key of versions.keys()) {
      const [term, yearStr] = key.split("::");
      const idx = termIndex(term, parseInt(yearStr, 10));
      if (idx < earliestIndex) { earliestIndex = idx; earliestKey = key; }
    }
    bestKey = earliestKey;
  }

  return bestKey ? versions.get(bestKey)!.sort((a, b) => a.orderIndex - b.orderIndex) : [];
}
