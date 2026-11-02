// Affiliated colleges' results (pure): the graduate-attribute roll-up and the sessional / total shares.
/** A student's % of the course from the items marked so far (blank = absent = 0 for the total). */
export function totalPct(items: { id: string; maxMarks: number; gradePct: number }[], marks: Record<string, number | null | undefined>) {
  const w = items.reduce((a, i) => a + i.gradePct, 0); if (!w) return null;
  return Math.round((items.reduce((a, i) => a + (typeof marks[i.id] === "number" ? ((marks[i.id] as number) / (i.maxMarks || 1)) * i.gradePct : 0), 0) / w) * 1000) / 10;
}
/** Graduate attributes from CLO results: the average % of the CLOs mapped to each GA, attained at the pass mark. */
export function gaFrom(clos: { code: string; pct: number | null; ga: string | null }[], passPct = 50) {
  const by = new Map<string, number[]>();
  for (const c of clos) if (c.ga && c.pct != null) by.set(c.ga, [...(by.get(c.ga) || []), c.pct]);
  return Array.from(by.entries()).map(([ga, ps]) => { const avg = Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 10) / 10; return { ga, pct: avg, attained: avg >= passPct }; }).sort((a, b) => a.ga.localeCompare(b.ga, undefined, { numeric: true }));
}
