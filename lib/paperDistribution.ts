import { prisma } from "./db";

export async function computePaperDistribution(courseId: string, examType: "Midterm" | "Final") {
  const [lectureRows, questions] = await Promise.all([
    prisma.lectureRow.findMany({
      where: { courseId, source: "SE" },
      include: { clo: true, instrumentLinks: { include: { instrument: true } } },
    }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "SE", type: examType }, orderBy: { label: "asc" } }),
  ]);

  const cloCodes = Array.from(new Set(lectureRows.filter((r) => r.clo).map((r) => r.clo!.code))).sort();

  // Topic -> CLO marks, counting only marks from THIS exam's questions.
  type TopicRow = { topic: string; lectures: number; byClo: Record<string, number>; total: number };
  const byTopic = new Map<string, TopicRow>();

  // Real per-instrument share: an instrument's marks split across however many rows link to it.
  const linkCounts = new Map<string, number>();
  for (const row of lectureRows) {
    for (const link of row.instrumentLinks) {
      if (link.instrument.type !== examType) continue;
      linkCounts.set(link.instrumentId, (linkCounts.get(link.instrumentId) || 0) + 1);
    }
  }

  for (const row of lectureRows) {
    if (!row.topic.trim()) continue;
    const existing = byTopic.get(row.topic) || { topic: row.topic, lectures: 0, byClo: Object.fromEntries(cloCodes.map((c) => [c, 0])), total: 0 };
    existing.lectures += 1;
    let rowExamMarks = 0;
    for (const link of row.instrumentLinks) {
      if (link.instrument.type !== examType) continue;
      const count = linkCounts.get(link.instrumentId) || 1;
      rowExamMarks += link.instrument.marksPct / count;
    }
    if (rowExamMarks > 0 && row.clo) {
      existing.byClo[row.clo.code] = (existing.byClo[row.clo.code] || 0) + rowExamMarks;
      existing.total += rowExamMarks;
    }
    byTopic.set(row.topic, existing);
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const topics = Array.from(byTopic.values())
    .filter((t) => t.total > 0)
    .map((t) => ({ ...t, total: round1(t.total), byClo: Object.fromEntries(Object.entries(t.byClo).map(([k, v]) => [k, round1(v)])) }));

  // Question -> CLO breakdown: which topics/CLOs does each question draw from.
  const questionRows = questions.map((q) => {
    const byClo: Record<string, number> = Object.fromEntries(cloCodes.map((c) => [c, 0]));
    const linkedRows = lectureRows.filter((r) => r.instrumentLinks.some((l) => l.instrumentId === q.id));
    const share = linkedRows.length > 0 ? q.marksPct / linkedRows.length : 0;
    for (const r of linkedRows) if (r.clo) byClo[r.clo.code] = round1((byClo[r.clo.code] || 0) + share);
    return { label: q.label, marksPct: q.marksPct, byClo };
  });

  return {
    cloCodes, topics, questionRows,
    totalMarks: round1(topics.reduce((s, t) => s + t.total, 0)),
  };
}
