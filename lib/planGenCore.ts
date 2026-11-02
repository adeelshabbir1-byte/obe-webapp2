import { isLocked, termIndex, type Item } from "./qbankCore";

// Assessments generated from the SE's plan (Adeel, 3 Nov 2026). Pure helpers: reuse gap, the class's graduate-attribute
// standing in a course, and the swaps that move a paper toward a weak GA without changing its difficulty or marks.

/** How many terms a question rests after it was used (agreed): final 3, mid 2, quiz / assignment / other 1. */
export const reuseGap = (examType: string) => (/final/i.test(examType) ? 3 : /mid/i.test(examType) ? 2 : 1);

/** Question ids still resting in `term`, from past uses (each use rests by its own assessment type). */
export function resting(uses: { itemId: string; termLabel: string; examType: string }[], term: string): Set<string> {
  const now = termIndex(term);
  const out = new Set<string>();
  if (now === null) return out;
  for (const u of uses) { const i = termIndex(u.termLabel); if (i !== null && now - i < reuseGap(u.examType)) out.add(u.itemId); }
  return out;
}

/** Default length in minutes per assessment type (the teacher can change it). Assignments are not timed. */
export const defaultMinutes = (type: string) => (/final/i.test(type) ? 180 : /mid/i.test(type) ? 90 : /quiz/i.test(type) ? 20 : 100000);
/** The OMC's CLO limits apply to the mid and the final; a quiz or assignment may sit on one or two CLOs. */
export const usesOmcLimits = (type: string) => /final|mid/i.test(type);

export type CloStand = { code: string; ga: string | null; avgPct: number; assessed: number };
export type GaStand = { ga: string; pct: number; clos: string[]; assessed: number };

/** The class's standing per graduate attribute in this course: the average of its CLOs' class averages (assessed only). */
export function gaStanding(clos: CloStand[]): GaStand[] {
  const by = new Map<string, CloStand[]>();
  for (const c of clos) if (c.ga) by.set(c.ga, [...(by.get(c.ga) || []), c]);
  return Array.from(by.entries()).map(([ga, cs]) => {
    const done = cs.filter((c) => c.assessed > 0);
    return { ga, clos: cs.map((c) => c.code), assessed: done.reduce((a, c) => a + c.assessed, 0), pct: done.length ? Math.round((10 * done.reduce((a, c) => a + c.avgPct, 0)) / done.length) / 10 : 0 };
  }).sort((a, b) => a.ga.localeCompare(b.ga, undefined, { numeric: true }));
}
/** Weak = assessed and below the target. */
export const weakGas = (gs: GaStand[], target: number) => gs.filter((g) => g.assessed > 0 && g.pct < target).sort((a, b) => a.pct - b.pct);

export type Swap = { fromId: string; toId: string; fromClo: string; toClo: string; fromTopic: string; toTopic: string; marks: number; difficulty: string };
export type SwapPlan = { swaps: Swap[]; needsOmc: Swap[]; none: string[] };

/**
 * Move up to `count` questions from the strongest GAs to the weak GA. A replacement has the same marks and the same
 * difficulty, a CLO of the weak GA, a topic already taught, and is not resting, locked or already in the paper.
 * Each CLO keeps the OMC minimum share and none goes above the maximum; a swap that would break that needs the OMC.
 */
export function planSwaps(paper: Item[], bank: Item[], o: { cloGa: Record<string, string | null>; standing: GaStand[]; weakGa: string; count: number; exclude: Set<string>; term: string; lastTaught: number | null; minCloPct: number; maxCloPct: number; limits: boolean }): SwapPlan {
  const total = paper.reduce((a, q) => a + q.marks, 0) || 1;
  const cloMarks = new Map<string, number>();
  for (const q of paper) cloMarks.set(q.cloCodes[0], (cloMarks.get(q.cloCodes[0]) || 0) + q.marks);
  const gaPct = new Map(o.standing.map((g) => [g.ga, g.pct]));
  const used = new Set(paper.map((q) => q.id).concat(Array.from(o.exclude)));
  const swaps: Swap[] = [], needsOmc: Swap[] = [], none: string[] = [];
  // Questions on other GAs' CLOs, strongest GA first, then the biggest share of marks.
  const from = paper.filter((q) => { const g = o.cloGa[q.cloCodes[0]]; return g && g !== o.weakGa; })
    .sort((a, b) => (gaPct.get(o.cloGa[b.cloCodes[0]]!) || 0) - (gaPct.get(o.cloGa[a.cloCodes[0]]!) || 0) || b.marks - a.marks);
  for (const q of from) {
    if (swaps.length + needsOmc.length >= o.count) break;
    const cand = bank.filter((x) => !used.has(x.id) && !isLocked(x.lockedUntil, o.term) && x.cloCodes.length && o.cloGa[x.cloCodes[0]] === o.weakGa && x.marks === q.marks && x.difficulty === q.difficulty && (o.lastTaught === null || x.lectureNumber === null || x.lectureNumber <= o.lastTaught))
      .sort((a, b) => a.usedCount - b.usedCount)[0];
    if (!cand) { none.push(`${q.cloCodes[0]} · ${q.marks} marks · ${q.difficulty.toLowerCase()}`); continue; }
    const s: Swap = { fromId: q.id, toId: cand.id, fromClo: q.cloCodes[0], toClo: cand.cloCodes[0], fromTopic: q.topic || (q.lectureNumber ? `L${q.lectureNumber}` : "—"), toTopic: cand.topic || (cand.lectureNumber ? `L${cand.lectureNumber}` : "—"), marks: q.marks, difficulty: q.difficulty };
    const left = ((cloMarks.get(s.fromClo) || 0) - s.marks) * 100 / total, added = ((cloMarks.get(s.toClo) || 0) + s.marks) * 100 / total;
    used.add(cand.id);
    if (o.limits && (left < o.minCloPct || added > o.maxCloPct)) { needsOmc.push(s); continue; }
    cloMarks.set(s.fromClo, (cloMarks.get(s.fromClo) || 0) - s.marks); cloMarks.set(s.toClo, (cloMarks.get(s.toClo) || 0) + s.marks);
    swaps.push(s);
  }
  return { swaps, needsOmc, none };
}

/** Effective when the GA rose after the remedy. */
export const effective = (before: number, after: number) => after > before;
