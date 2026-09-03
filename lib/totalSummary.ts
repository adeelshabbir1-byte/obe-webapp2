import { prisma } from "./db";

export async function computeTotalSummary(courseId: string) {
  const [lectureRows, clos, instrumentLinks] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, orderBy: { lectureNumber: "asc" }, include: { clo: { include: { mappedPlo: true } } } }),
    prisma.cLO.findMany({ where: { courseId, source: "SE" }, include: { mappedPlo: true } }),
    prisma.lectureRowInstrument.findMany({ where: { lectureRow: { courseId, source: "SE" } }, include: { instrument: true, lectureRow: true } }),
  ]);

  // marks per (lectureRowId, instrumentType), splitting a shared instrument's
  // marks evenly across however many rows it's linked to (same rule as elsewhere).
  const countByInstrument = new Map<string, number>();
  for (const link of instrumentLinks) countByInstrument.set(link.instrumentId, (countByInstrument.get(link.instrumentId) || 0) + 1);

  const marksByRowAndType = new Map<string, Record<string, number>>();
  for (const link of instrumentLinks) {
    const count = countByInstrument.get(link.instrumentId) || 1;
    const share = link.instrument.marksPct / count;
    const existing = marksByRowAndType.get(link.lectureRowId) || {};
    existing[link.instrument.type] = (existing[link.instrument.type] || 0) + share;
    marksByRowAndType.set(link.lectureRowId, existing);
  }

  const cloCodes = clos.map((c) => c.code);
  const plos = Array.from(new Map(clos.filter((c) => c.mappedPlo).map((c) => [c.mappedPlo!.id, c.mappedPlo!])).values());

  type TopicRow = {
    topic: string; lectures: number;
    byClo: Record<string, number>; cloTotal: number;
    byType: Record<string, number>;
    byPlo: Record<string, number>;
  };
  const byTopic = new Map<string, TopicRow>();

  for (const row of lectureRows) {
    if (!row.topic.trim()) continue;
    const existing = byTopic.get(row.topic) || {
      topic: row.topic, lectures: 0,
      byClo: Object.fromEntries(cloCodes.map((c) => [c, 0])), cloTotal: 0,
      byType: { Assignment: 0, Quiz: 0, Project: 0, Lab: 0, Midterm: 0, Final: 0 },
      byPlo: Object.fromEntries(plos.map((p) => [`PLO-${p.number}`, 0])),
    };
    existing.lectures += 1;

    if (row.clo) {
      existing.byClo[row.clo.code] = (existing.byClo[row.clo.code] || 0) + row.weightPct;
      existing.cloTotal += row.weightPct;
      if (row.clo.mappedPlo && row.clo.ploContributionPct) {
        const ploShare = (row.weightPct * row.clo.ploContributionPct) / 100;
        const key = `PLO-${row.clo.mappedPlo.number}`;
        existing.byPlo[key] = (existing.byPlo[key] || 0) + ploShare;
      }
    }

    const typeMarks = marksByRowAndType.get(row.id) || {};
    for (const [type, marks] of Object.entries(typeMarks)) existing.byType[type] = (existing.byType[type] || 0) + marks;

    byTopic.set(row.topic, existing);
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const topics = Array.from(byTopic.values()).map((t) => ({
    ...t, cloTotal: round1(t.cloTotal),
    byClo: Object.fromEntries(Object.entries(t.byClo).map(([k, v]) => [k, round1(v)])),
    byType: Object.fromEntries(Object.entries(t.byType).map(([k, v]) => [k, round1(v)])),
    byPlo: Object.fromEntries(Object.entries(t.byPlo).map(([k, v]) => [k, round1(v)])),
  }));

  return {
    cloCodes, ploLabels: plos.map((p) => `PLO-${p.number}`), topics,
    totalLectures: lectureRows.length,
    grandTotal: round1(topics.reduce((s, t) => s + t.cloTotal, 0)),
  };
}
