import { prisma } from "./db";
import { termIndex } from "./termLogic";

export type PassingCriteria = { cloPct: number; ploPct: number };

const DEFAULT_CRITERIA: PassingCriteria = { cloPct: 50, ploPct: 50 };

// Versioned the same way getGradingScaleForBatch is: a new version with
// a later effectiveFrom term/year applies going forward without
// silently reinterpreting reports run against an earlier term under the
// old thresholds. The `term` parameter is optional and defaults to the
// most recent version on record — every existing call site that hasn't
// been updated to pass a specific term keeps working exactly as before,
// just now against whichever version is current rather than a single,
// unversioned row.
export async function getPassingCriteria(chairmanId: string | null | undefined, term?: { termName: string; year: number }): Promise<PassingCriteria> {
  if (!chairmanId) return DEFAULT_CRITERIA;
  const allVersions = await prisma.passingCriteria.findMany({ where: { chairmanId } });
  if (allVersions.length === 0) return DEFAULT_CRITERIA;

  if (!term) {
    // No specific term given — use whichever version is most recent.
    const latest = allVersions.reduce((best, v) => termIndex(v.effectiveFromTerm, v.effectiveFromYear) > termIndex(best.effectiveFromTerm, best.effectiveFromYear) ? v : best);
    return { cloPct: latest.cloPassingPct, ploPct: latest.ploPassingPct };
  }

  const targetIndex = termIndex(term.termName, term.year);
  let best: typeof allVersions[number] | null = null, bestIndex = -Infinity;
  for (const v of allVersions) {
    const idx = termIndex(v.effectiveFromTerm, v.effectiveFromYear);
    if (idx <= targetIndex && idx > bestIndex) { bestIndex = idx; best = v; }
  }
  // The given term predates every version on record — fall back to the
  // earliest version rather than the unversioned default.
  if (!best) {
    best = allVersions.reduce((earliest, v) => termIndex(v.effectiveFromTerm, v.effectiveFromYear) < termIndex(earliest.effectiveFromTerm, earliest.effectiveFromYear) ? v : earliest);
  }
  return { cloPct: best.cloPassingPct, ploPct: best.ploPassingPct };
}
