import { tokens } from "./catalogCore";

// Collaborative exam papers — the rules, with no database: near-duplicate questions (by meaning: synonyms and word
// stems), the exam blueprint (difficulty ratio and CLO spread), average star ratings, the consensus paper (the highest
// rated question per slot, ties to the Course Lead) and the exam-to-CLO mapping table.

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const KINDS: [string, string][] = [["SHORT", "Short answer"], ["LONG", "Long answer"], ["PROBLEM", "Problem / numerical"], ["MCQ", "Multiple choice"], ["CODE", "Code / programming"]];
export const BLOOM_NAMES: Record<string, string> = { C1: "Remembering", C2: "Understanding", C3: "Applying", C4: "Analyzing", C5: "Evaluating", C6: "Creating" };
export const BLOOM_LEVELS = Object.keys(BLOOM_NAMES);
export const EXAMS = ["Midterm", "Final"] as const;

/** A bank question as the exam board sees it. */
export type BQ = {
  id: string; text: string; marks: number; kind: string; difficulty: Difficulty | null; cloCodes: string[]; bloom: string;
  lectureNumber: number | null; week: number | null; topic: string; authorId: string;
};
/** Metadata the spec makes mandatory: a lecture topic, at least one CLO, a difficulty and a Bloom level. */
export const complete = (q: BQ) => !!q.difficulty && q.cloCodes.length > 0 && q.lectureNumber !== null && BLOOM_LEVELS.includes(q.bloom);

// ---- near-duplicates
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Instruction words every question uses — they never make two questions alike. */
const QSTOP = new Set("explain describe discus define write give state mention elaborate briefly short note following between what which how why when where who whom your each with without also any all both show find calculate compute determine illustrate suitable example".split(" "));
/** Word families: insertion / inserting / insert, difference / differs / differ. */
const family = (w: string) => (w.length <= 5 ? w : w.replace(/(at)?ions?$/, "").replace(/(ences?|ances?)$/, "").replace(/(ments?|ness)$/, ""));
function qtokens(t: string) { const out = new Set<string>(); tokens(t).forEach((w) => { if (!QSTOP.has(w)) out.add(family(w)); }); return out; }
/** How alike two questions are in meaning, 0–1. Short questions only count as duplicates when (almost) word for word. */
export function questionSimilarity(a: string, b: string) {
  if (norm(a) && norm(a) === norm(b)) return 1;
  const A = qtokens(a), B = qtokens(b);
  if (A.size < 3 || B.size < 3) return 0;
  let shared = 0;
  A.forEach((w) => { if (B.has(w)) shared++; });
  if (!shared) return 0;
  const jac = shared / (A.size + B.size - shared), contain = shared / Math.min(A.size, B.size);
  return Math.round((0.6 * jac + 0.4 * contain) * 100) / 100;
}
export const DUPLICATE_AT = 0.7;
export function duplicates(text: string, bank: { id: string; text: string }[], min = DUPLICATE_AT) {
  return bank.map((q) => ({ id: q.id, text: q.text, similarity: questionSimilarity(text, q.text) })).filter((x) => x.similarity >= min).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

// ---- blueprint
export type Blueprint = { easyPct: number; mediumPct: number; hardPct: number; tolerancePct: number; minCloPct: number; maxCloPct: number };
export const DEFAULT_BLUEPRINT: Blueprint = { easyPct: 20, mediumPct: 60, hardPct: 20, tolerancePct: 10, minCloPct: 10, maxCloPct: 50 };
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Marks per CLO: a question tagged to several CLOs shares its marks equally between them. */
export function cloMarks(qs: Pick<BQ, "cloCodes" | "marks">[]) {
  const m = new Map<string, number>();
  for (const q of qs) for (const c of q.cloCodes) m.set(c, (m.get(c) || 0) + q.marks / q.cloCodes.length);
  return m;
}
/**
 * The specification grid: difficulty shares by marks within the tolerance of the target, every CLO this exam must
 * assess carries at least minCloPct of the marks, no CLO more than maxCloPct (when two or more are assessed), the OMC's
 * minimum number of questions, and (midterm) topics from before the midterm.
 */
export function blueprintCheck(qs: (Pick<BQ, "difficulty" | "cloCodes" | "marks" | "week"> & { label?: string })[], bp: Blueprint, ctx: { requiredClos: string[]; minQuestions?: number; midtermWeek?: number | null; examType: string }) {
  const fails: string[] = [], warns: string[] = [];
  const total = qs.reduce((s, q) => s + q.marks, 0);
  const share = (d: Difficulty) => (total ? r1((100 * qs.filter((q) => q.difficulty === d).reduce((s, q) => s + q.marks, 0)) / total) : 0);
  const mix = { EASY: share("EASY"), MEDIUM: share("MEDIUM"), HARD: share("HARD") };
  const per = cloMarks(qs);
  const perClo = Array.from(new Set([...ctx.requiredClos, ...Array.from(per.keys())])).map((code) => ({ code, marks: r1(per.get(code) || 0), pct: total ? r1((100 * (per.get(code) || 0)) / total) : 0, required: ctx.requiredClos.includes(code) }));
  if (!qs.length) return { ok: false, fails: ["The paper has no questions."], warns, mix, perClo, total };
  if (qs.some((q) => !q.difficulty)) fails.push("Every question needs a difficulty (Easy, Medium or Hard).");
  if (qs.some((q) => !q.cloCodes.length)) fails.push("Every question must map to at least one CLO.");
  const target: Record<Difficulty, number> = { EASY: bp.easyPct, MEDIUM: bp.mediumPct, HARD: bp.hardPct };
  for (const d of DIFFICULTIES) if (Math.abs(mix[d] - target[d]) > bp.tolerancePct) fails.push(`${d[0] + d.slice(1).toLowerCase()} questions carry ${mix[d]}% of the marks; the blueprint asks ${target[d]}% (± ${bp.tolerancePct}).`);
  const assessed = perClo.filter((p) => p.marks > 0);
  for (const p of perClo.filter((x) => x.required)) {
    if (!p.marks) fails.push(`${p.code} is taught in this part of the course but not assessed.`);
    else if (p.pct < bp.minCloPct) fails.push(`${p.code} carries only ${p.pct}% of the marks (at least ${bp.minCloPct}%).`);
  }
  if (assessed.length > 1) for (const p of assessed) if (p.pct > bp.maxCloPct) fails.push(`${p.code} carries ${p.pct}% of the marks (at most ${bp.maxCloPct}%).`);
  if (ctx.minQuestions && qs.length < ctx.minQuestions) fails.push(`The OMC asks for at least ${ctx.minQuestions} questions in the ${ctx.examType.toLowerCase()}; this paper has ${qs.length}.`);
  if (ctx.examType === "Midterm" && ctx.midtermWeek) {
    const late = qs.filter((q) => q.week !== null && q.week >= ctx.midtermWeek!);
    if (late.length) warns.push(`${late.length} question(s) come from week ${ctx.midtermWeek} or later — after the midterm.`);
  }
  return { ok: fails.length === 0, fails, warns, mix, perClo, total };
}

// ---- ratings
export const avgStars = (stars: number[]) => (stars.length ? Math.round((100 * stars.reduce((a, b) => a + b, 0)) / stars.length) / 100 : null);
/** 1–2 stars need a reason (poor wording, wrong answer, off-topic). */
export function ratingError(stars: number, comment: string) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return "Give 1 to 5 stars.";
  if (stars <= 2 && comment.trim().length < 5) return "Say what is wrong (1–2 stars need a reason).";
  return null;
}

// ---- consensus
export type Slot = { key: string; label: string; clo: string | null; lectureNumber: number | null; marks: number | null };
export type Candidate = BQ & { avg: number | null; n: number };
export type Decision = { itemId: string; by: string; at: string; kind: "TIE" | "PICK" | "OVERRIDE" | "ADDED"; note?: string };
export type SlotPick = { slot: Slot; itemId: string | null; status: "AUTO" | "LEAD" | "TIE" | "UNRATED" | "EMPTY"; tied: string[]; ranked: { id: string; avg: number | null; n: number }[] };

/** Slots when the team has no question plan: per CLO, the average number of questions the drafts gave it (at least one). */
export function deriveSlots(drafts: string[][], byId: Map<string, { cloCodes: string[] }>): Slot[] {
  const counts = new Map<string, number[]>();
  drafts.forEach((ids, d) => {
    for (const id of ids) { const q = byId.get(id); const c = q?.cloCodes[0]; if (!c) continue; const a = counts.get(c) || drafts.map(() => 0); a[d]++; counts.set(c, a); }
  });
  const out: Slot[] = [];
  Array.from(counts.keys()).sort().forEach((c) => {
    const a = counts.get(c)!, n = Math.max(1, Math.round(a.reduce((x, y) => x + y, 0) / drafts.length));
    for (let i = 1; i <= n; i++) out.push({ key: `${c}#${i}`, label: `${c} — question ${i}`, clo: c, lectureNumber: null, marks: null });
  });
  return out;
}

/**
 * For each slot, the proposed question with the highest average rating (more ratings break nothing — equal averages are
 * a tie for the Course Lead). A question is used once. The Lead's decisions are fixed first.
 */
export function consensus(slots: Slot[], candidates: Candidate[], decisions: Record<string, Decision>): SlotPick[] {
  const used = new Set<string>(Object.values(decisions).map((d) => d.itemId));
  return slots.map((slot) => {
    const dec = decisions[slot.key];
    const fits = candidates.filter((c) => !slot.clo || c.cloCodes.includes(slot.clo));
    const atLecture = slot.lectureNumber !== null ? fits.filter((c) => c.lectureNumber === slot.lectureNumber) : [];
    const pool = (atLecture.length ? atLecture : fits).filter((c) => !used.has(c.id) || c.id === dec?.itemId);
    const ranked = pool.slice().sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.n - a.n || a.id.localeCompare(b.id)).map((c) => ({ id: c.id, avg: c.avg, n: c.n }));
    if (dec) return { slot, itemId: dec.itemId, status: "LEAD" as const, tied: [], ranked };
    const free = ranked.filter((r) => !used.has(r.id));
    if (!free.length) return { slot, itemId: null, status: "EMPTY" as const, tied: [], ranked };
    if (free[0].avg === null) return { slot, itemId: null, status: "UNRATED" as const, tied: [], ranked };
    const tied = free.filter((r) => r.avg === free[0].avg).map((r) => r.id);
    if (tied.length > 1) return { slot, itemId: null, status: "TIE" as const, tied, ranked };
    used.add(free[0].id);
    return { slot, itemId: free[0].id, status: "AUTO" as const, tied: [], ranked };
  });
}

// ---- mapping table
export type PaperQ = { no: number; id: string; text: string; marks: number; difficulty: string | null; cloCodes: string[]; bloom: string; lectureNumber: number | null; topic: string };
export function mappingTable(qs: PaperQ[]) {
  const total = qs.reduce((s, q) => s + q.marks, 0);
  const per = cloMarks(qs);
  const perClo = Array.from(per.keys()).sort().map((code) => ({ code, marks: r1(per.get(code)!), pct: total ? r1((100 * per.get(code)!) / total) : 0, questions: qs.filter((q) => q.cloCodes.includes(code)).map((q) => q.no) }));
  const by = (f: (q: PaperQ) => string) => { const m = new Map<string, number>(); for (const q of qs) m.set(f(q), (m.get(f(q)) || 0) + q.marks); return Array.from(m.entries()).sort().map(([k, v]) => ({ key: k, marks: r1(v), pct: total ? r1((100 * v) / total) : 0 })); };
  return { total, perClo, difficulty: by((q) => q.difficulty || "—"), bloom: by((q) => q.bloom || "—") };
}
