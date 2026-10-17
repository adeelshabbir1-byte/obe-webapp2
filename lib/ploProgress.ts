import { prisma } from "./db";
import { termIndex } from "./termLogic";

/** A batch's PLO attainment term by term: for each term, cumulative over all courses so far, the % of students whose
 * average PLO score reached the pass mark, plus the class average. Built from the transcript records. */
export async function ploProgress(batchId: string, passPct = 50) {
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { student: { batchId } }, select: { studentId: true, termName: true, termYear: true, ploAttainmentJson: true } });
  const terms = Array.from(new Set(recs.map((r) => `${r.termName} ${r.termYear}`))).sort((a, b) => { const [an, ay] = a.split(" "), [bn, by] = b.split(" "); return termIndex(an, +ay) - termIndex(bn, +by); });
  const plos = new Set<string>();
  const rows = recs.map((r) => { let p: { label: string; pct: number }[] = []; try { p = JSON.parse(r.ploAttainmentJson); } catch { p = []; } p.forEach((x) => plos.add(x.label)); return { s: r.studentId, t: terms.indexOf(`${r.termName} ${r.termYear}`), p }; });
  const ploList = Array.from(plos).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  const series = ploList.map((label) => ({
    label,
    points: terms.map((term, ti) => {
      const per = new Map<string, number[]>();
      for (const r of rows) if (r.t <= ti) for (const x of r.p) if (x.label === label) per.set(r.s, [...(per.get(r.s) || []), x.pct]);
      const avgs = Array.from(per.values()).map((v) => v.reduce((a, b) => a + b, 0) / v.length);
      if (!avgs.length) return { term, reached: null as number | null, avg: null as number | null };
      return { term, reached: Math.round((1000 * avgs.filter((a) => a >= passPct).length) / avgs.length) / 10, avg: Math.round((10 * avgs.reduce((a, b) => a + b, 0)) / avgs.length) / 10 };
    }),
  }));
  return { terms, series };
}
