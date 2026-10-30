import { gate3Course, type GCourse } from "./stageGateCore";

// Hybrid course synthesis and Golden Copy guardrails, with no database.
//  · A proposal is a full draft of one course: description, CLOs, the 32-lecture plan, lab plan, assessment split, books.
//  · The synthesizer builds the final course by picking parts from different proposals (base structure from A, weeks
//    5–8 from B, assessments and books from C), and every pick is checked at once (Gate 3 and the Golden Copy locks).
//  · An institute's copy of an HEC Golden Copy keeps the locked fields (code, title, credit hours, mandatory CLOs, their
//    PLO weights, core topics); the compliance meter scores the copy against the Golden Copy: green 100%, yellow 80–99.99%
//    (local additions, justify at accreditation), red < 80% (core mandates missing — accreditation submission blocked).

export type Parts = {
  description: string; clos: { statement: string; bloom: string }[]; topics: { n: number; topic: string; sub?: string; clo: number | null }[];
  labPlan: { week: number; experiment: string }[]; assessments: { type: string; pct: number }[]; books: { title: string; kind: "TEXT" | "REFERENCE" }[];
};
export type Proposal = { id: string; author: string; parts: Parts };
export const MODULES: [string, number, number][] = [["Weeks 1–4", 1, 8], ["Weeks 5–8", 9, 16], ["Weeks 9–12", 17, 24], ["Weeks 13–16", 25, 32]];
export type Picks = { base: string; modules: string[]; lab: string; assessments: string; books: string };

/** The synthesized course: base (description + CLOs) from one proposal, each 4-week module of lectures from its pick, … */
export function synthesize(proposals: Proposal[], p: Picks): Parts {
  const by = new Map(proposals.map((x) => [x.id, x.parts]));
  const base = by.get(p.base);
  if (!base) throw new Error("Choose the base proposal.");
  const topics = MODULES.flatMap(([, from, to], i) => (by.get(p.modules[i] || p.base) || base).topics.filter((t) => t.n >= from && t.n <= to));
  return {
    description: base.description, clos: base.clos,
    topics: topics.map((t) => ({ ...t, clo: t.clo && t.clo <= base.clos.length ? t.clo : null })),
    labPlan: (by.get(p.lab) || base).labPlan, assessments: (by.get(p.assessments) || base).assessments, books: (by.get(p.books) || base).books,
  };
}
/** Real-time checks of a synthesized course: Gate 3, assessments to 100%, and the Golden Copy's locked content kept. */
export function synthesisChecks(parts: Parts, course: { id: string; code: string; title: string; creditHours: number; labCredits: number; category: string; prerequisiteId: string | null; noPrereq: boolean; ploOf: (cloIndex: number) => string[] }, golden?: { clos: string[]; topics: string[] } | null) {
  const g: GCourse = {
    id: course.id, code: course.code, title: course.title, creditHours: course.creditHours, labCredits: course.labCredits, category: course.category, description: parts.description,
    prerequisiteId: course.prerequisiteId, noPrereq: course.noPrereq,
    clos: parts.clos.map((c, i) => ({ id: `c${i}`, n: i + 1, bloom: c.bloom, ploIds: course.ploOf(i) })), weights: [],
    topics: parts.topics.map((t) => ({ lecture: t.n, cloNumber: t.clo })), labWeeks: parts.labPlan.map((l) => l.week), topicDeps: [],
  };
  const gate = gate3Course(g, [g]);
  const issues = gate.parts.filter((x) => !x.ok).flatMap((x) => x.why.map((w) => `${x.label}: ${w}`));
  const sum = parts.assessments.reduce((a, x) => a + x.pct, 0);
  if (parts.assessments.length && Math.abs(sum - 100) > 0.01) issues.push(`Assessments add up to ${sum}%, not 100%.`);
  if (golden) {
    const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const clos = new Set(parts.clos.map((c) => n(c.statement))), topics = new Set(parts.topics.map((t) => n(t.topic)));
    const lostClos = golden.clos.filter((c) => !clos.has(n(c))), lostTopics = golden.topics.filter((t) => !topics.has(n(t)));
    if (lostClos.length) issues.push(`HEC guardrail: ${lostClos.length} mandatory CLO(s) of the Golden Copy are missing or changed.`);
    if (lostTopics.length) issues.push(`HEC guardrail: ${lostTopics.length} core topic(s) of the Golden Copy are missing or renamed.`);
  }
  return { pct: gate.pct, issues, ok: !issues.length };
}

// ---- Golden Copy compliance
export type GCourseLite = { code: string; title: string; creditHours: number; category: string; pool: boolean; clos: string[]; topics: string[] };
const nt = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
export const sameCourse = (a: { code: string; title: string }, b: { code: string; title: string }) => a.code.trim().toUpperCase() === b.code.trim().toUpperCase() || nt(a.title) === nt(b.title);
/**
 * Score of an institute's copy against the Golden Copy. Each mandatory course: 3 points when present with the same code,
 * title and credit hours (1 if present but changed), 1 per mandatory CLO kept, 1 when ≥ 90% of its topics are kept. Local
 * courses not in the Golden Copy (e.g. local electives) add 1 each to the total, so they move a perfect copy to yellow.
 */
export function compliance(golden: GCourseLite[], inst: GCourseLite[]) {
  let got = 0, total = 0;
  const missing: string[] = [], changed: string[] = [], lostClos: string[] = [];
  for (const g of golden.filter((x) => !x.pool)) {
    const m = inst.find((x) => sameCourse(x, g));
    total += 3 + g.clos.length + (g.topics.length ? 1 : 0);
    if (!m) { missing.push(`${g.code} ${g.title}`); continue; }
    const same = m.code.trim().toUpperCase() === g.code.trim().toUpperCase() && nt(m.title) === nt(g.title) && m.creditHours === g.creditHours;
    got += same ? 3 : 1;
    if (!same) changed.push(`${g.code} ${g.title}${m.creditHours !== g.creditHours ? ` (${m.creditHours} CH, HEC ${g.creditHours})` : m.code !== g.code ? ` (coded ${m.code})` : " (title changed)"}`);
    const mc = new Set(m.clos.map(nt));
    const kept = g.clos.filter((c) => mc.has(nt(c))).length;
    got += kept;
    if (kept < g.clos.length) lostClos.push(`${g.code}: ${g.clos.length - kept} CLO(s)`);
    if (g.topics.length) { const mt = new Set(m.topics.map(nt)); if (g.topics.filter((t) => mt.has(nt(t))).length >= 0.9 * g.topics.length) got += 1; }
  }
  const extras = inst.filter((x) => !golden.some((g) => sameCourse(x, g))).map((x) => `${x.code} ${x.title}`);
  total += extras.length;
  const score = total ? Math.round((10000 * got) / total) / 100 : 100;
  const band = score >= 100 ? "GREEN" : score >= 80 ? "YELLOW" : "RED";
  return { score, band: band as "GREEN" | "YELLOW" | "RED", missing, changed, lostClos, extras };
}
/** A change to an institute copy's course: refused when it touches a field the Golden Copy locks. */
export function lockedCourseChange(golden: GCourseLite | null, patch: { code?: string; title?: string; creditHours?: number; remove?: boolean }) {
  if (!golden) return null;
  if (patch.remove && !golden.pool) return `${golden.code} ${golden.title} is part of the HEC Golden Copy and can't be removed (only electives from the HEC pool can be dropped).`;
  if (patch.code !== undefined && patch.code.trim().toUpperCase() !== golden.code.toUpperCase()) return `The course code ${golden.code} is set by HEC (Golden Copy) and can't be changed.`;
  if (patch.title !== undefined && nt(patch.title) !== nt(golden.title)) return `The title "${golden.title}" is set by HEC (Golden Copy) and can't be changed.`;
  if (patch.creditHours !== undefined && Number(patch.creditHours) !== golden.creditHours) return `The credit hours (${golden.creditHours}) are set by HEC (Golden Copy) and can't be changed.`;
  return null;
}
export const lockedCloChange = (goldenClos: string[], current: string, patch: { statement?: string; remove?: boolean }) => {
  const mandatory = goldenClos.some((c) => nt(c) === nt(current));
  if (!mandatory) return null;
  if (patch.remove) return "This CLO is mandatory in the HEC Golden Copy and can't be deleted.";
  if (patch.statement !== undefined && nt(patch.statement) !== nt(current)) return "This CLO is mandatory in the HEC Golden Copy and can't be reworded. Add your own CLO instead.";
  return null;
};
