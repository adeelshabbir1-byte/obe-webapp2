import { prisma } from "./db";

type Snap = {
  weights: Record<string, number | null>;
  clos: { code: string; statement: string; bloom: string; plo: string | null; contribution: number | null }[];
  lectures: { n: number; week: number; topic: string; subtopic: string | null; clo: string | null }[];
  instruments: { type: string; label: string; marksPct: number; maxScore: number }[];
};

const WEIGHT_FIELDS: [string, string][] = [
  ["assignmentPct", "Assignment weight (%)"], ["quizPct", "Quiz weight (%)"], ["projectPct", "Project weight (%)"], ["labPct", "Lab weight (%)"],
  ["midtermPct", "Midterm weight (%)"], ["finalPct", "Final weight (%)"],
  ["assignmentCount", "Number of assignments"], ["quizCount", "Number of quizzes"], ["projectCount", "Number of projects"], ["labCount", "Number of labs"],
  ["midtermCount", "Midterm questions"], ["finalCount", "Final questions"], ["quizBestOf", "Quiz best-of"], ["assignmentBestOf", "Assignment best-of"],
];

/** A copy of the SE's template as it is right now — taken when edits are reopened, compared when the SE resubmits. */
export async function snapshotTemplate(courseId: string): Promise<Snap> {
  const [course, clos, rows, instruments] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.cLO.findMany({ where: { courseId, source: "SE" }, include: { mappedPlo: true }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, include: { clo: true }, orderBy: { lectureNumber: "asc" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "SE" }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
  ]);
  const c = (course || {}) as unknown as Record<string, number | null>;
  const weights: Record<string, number | null> = {};
  for (const [k] of WEIGHT_FIELDS) weights[k] = c[k] ?? null;
  return {
    weights,
    clos: (clos as any[]).map((x) => ({ code: x.code, statement: x.statement, bloom: x.bloomLevel, plo: x.mappedPlo ? `PLO-${x.mappedPlo.number}` : null, contribution: x.ploContributionPct ?? null })),
    lectures: (rows as any[]).map((r) => ({ n: r.lectureNumber, week: r.week, topic: r.topic, subtopic: r.subtopic, clo: r.clo ? r.clo.code : null })),
    instruments: (instruments as any[]).map((i) => ({ type: i.type, label: i.label, marksPct: Math.round(i.marksPct * 100) / 100, maxScore: i.maxScore })),
  };
}

const short = (t: string | null | undefined, n = 70) => { const s = (t || "").trim(); return s.length > n ? s.slice(0, n) + "…" : s || "(blank)"; };

/** Plain-language list of what changed between two snapshots. */
export function diffTemplates(before: Snap, after: Snap): string[] {
  const out: string[] = [];
  for (const [k, label] of WEIGHT_FIELDS) {
    const a = before.weights[k] ?? null, b = after.weights[k] ?? null;
    if (a !== b) out.push(`Weights: ${label} changed from ${a ?? "none"} to ${b ?? "none"}`);
  }
  const bc = new Map(before.clos.map((x) => [x.code, x])), ac = new Map(after.clos.map((x) => [x.code, x]));
  Array.from(ac.entries()).forEach(([code, x]) => {
    const o = bc.get(code);
    if (!o) { out.push(`CLO: ${code} added — "${short(x.statement)}"`); return; }
    if (o.statement !== x.statement) out.push(`CLO: ${code} statement changed from "${short(o.statement)}" to "${short(x.statement)}"`);
    if (o.bloom !== x.bloom) out.push(`CLO: ${code} Bloom level changed from ${o.bloom} to ${x.bloom}`);
    if (o.plo !== x.plo) out.push(`CLO: ${code} now maps to ${x.plo ?? "no PLO"} (was ${o.plo ?? "no PLO"})`);
    else if (o.contribution !== x.contribution) out.push(`CLO: ${code} contribution to ${x.plo ?? "PLO"} changed from ${o.contribution ?? 0}% to ${x.contribution ?? 0}%`);
  });
  Array.from(bc.keys()).forEach((code) => { if (!ac.has(code)) out.push(`CLO: ${code} removed`); });

  const bl = new Map(before.lectures.map((x) => [x.n, x])), al = new Map(after.lectures.map((x) => [x.n, x]));
  const lec: string[] = [];
  Array.from(al.entries()).forEach(([n, x]) => {
    const o = bl.get(n);
    if (!o) { lec.push(`Lecture ${n} added — ${short(x.topic)}`); return; }
    if (o.topic !== x.topic || (o.subtopic || "") !== (x.subtopic || "")) lec.push(`Lecture ${n} topic changed from "${short(o.topic)}" to "${short(x.topic)}"`);
    if (o.clo !== x.clo) lec.push(`Lecture ${n} now maps to ${x.clo ?? "no CLO"} (was ${o.clo ?? "no CLO"})`);
    if (o.week !== x.week) lec.push(`Lecture ${n} moved from week ${o.week} to week ${x.week}`);
  });
  Array.from(bl.keys()).forEach((n) => { if (!al.has(n)) lec.push(`Lecture ${n} removed`); });
  if (lec.length > 25) out.push(`Lecture plan: ${lec.length} lecture changes (first 25 shown)`, ...lec.slice(0, 25).map((l) => `Lecture plan: ${l}`));
  else out.push(...lec.map((l) => `Lecture plan: ${l}`));

  const key = (i: { type: string; label: string }) => `${i.type}|${i.label}`;
  const bi = new Map(before.instruments.map((x) => [key(x), x])), ai = new Map(after.instruments.map((x) => [key(x), x]));
  Array.from(ai.entries()).forEach(([k, x]) => {
    const o = bi.get(k);
    if (!o) { out.push(`Assessments: ${x.type} "${x.label}" added (${x.marksPct}%, out of ${x.maxScore})`); return; }
    if (o.marksPct !== x.marksPct) out.push(`Assessments: ${x.type} "${x.label}" weight changed from ${o.marksPct}% to ${x.marksPct}%`);
    if (o.maxScore !== x.maxScore) out.push(`Assessments: ${x.type} "${x.label}" marked out of ${x.maxScore} (was ${o.maxScore})`);
  });
  Array.from(bi.entries()).forEach(([k, x]) => { if (!ai.has(k)) out.push(`Assessments: ${x.type} "${x.label}" removed`); });
  return out;
}
