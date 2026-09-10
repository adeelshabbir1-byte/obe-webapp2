import { prisma } from "./db";
import { computeResultMate } from "./resultMate";

export type CoAttainmentRow = { code: string; targetPct: number; actualPct: number; level: number };
export type PoAttainmentRow = { label: string; level: number };

function levelFor(actualPct: number, targetPct: number): number {
  if (actualPct >= targetPct + 10) return 3;
  if (actualPct >= targetPct) return 2;
  if (actualPct >= targetPct - 10) return 1;
  return 0;
}

/** CO (CLO) attainment: target % (faculty-set) vs actual % of students who
 * attained it, each mapped to a 0-3 NBA/Washington-Accord style level. */
export async function computeCoAttainment(courseId: string, criteria?: { cloPct: number; ploPct: number }): Promise<{ rows: CoAttainmentRow[]; poRows: PoAttainmentRow[] }> {
  const passCriteria = criteria || { cloPct: 50, ploPct: 50 };
  const result = await computeResultMate(courseId);
  const clos = await prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, include: { mappedPlo: true } });

  const instruments = await prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" } });
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId, source: "INSTRUCTOR" } }, include: { lectureRow: true } });
  const instrumentToClo = new Map<string, string>();
  for (const link of links) if (link.lectureRow.cloId && !instrumentToClo.has(link.instrumentId)) instrumentToClo.set(link.instrumentId, link.lectureRow.cloId);

  const cloMaxWeight: Record<string, number> = {};
  for (const clo of clos) cloMaxWeight[clo.code] = 0;
  for (const inst of instruments) {
    const cloId = instrumentToClo.get(inst.id);
    const clo = clos.find((c) => c.id === cloId);
    if (clo) cloMaxWeight[clo.code] = (cloMaxWeight[clo.code] || 0) + inst.marksPct;
  }

  const rows: CoAttainmentRow[] = clos.map((clo) => {
    const max = cloMaxWeight[clo.code] || 0;
    const threshold = max * (passCriteria.cloPct / 100);
    const passCount = result.rows.filter((r) => (r.byClo[clo.code] || 0) >= threshold).length;
    const actualPct = result.rows.length > 0 ? Math.round((passCount / result.rows.length) * 1000) / 10 : 0;
    return { code: clo.code, targetPct: clo.targetPct, actualPct, level: levelFor(actualPct, clo.targetPct) };
  });

  // PO attainment: weighted average of contributing COs' levels, weighted by ploContributionPct.
  const poMap = new Map<string, { totalWeight: number; weightedLevel: number }>();
  for (const clo of clos) {
    if (!clo.mappedPlo || !clo.ploContributionPct) continue;
    const label = `PLO-${clo.mappedPlo.number}`;
    const row = rows.find((r) => r.code === clo.code);
    if (!row) continue;
    const entry = poMap.get(label) || { totalWeight: 0, weightedLevel: 0 };
    entry.totalWeight += clo.ploContributionPct;
    entry.weightedLevel += row.level * clo.ploContributionPct;
    poMap.set(label, entry);
  }
  const poRows: PoAttainmentRow[] = Array.from(poMap.entries()).map(([label, v]) => ({
    label, level: v.totalWeight > 0 ? Math.round((v.weightedLevel / v.totalWeight) * 100) / 100 : 0,
  })).sort((a, b) => a.label.localeCompare(b.label));

  return { rows, poRows };
}
