// Question bank (Part 6, build A) — the pure rules: types, review and visibility, the 3-term re-use lock, learning
// from results (average, discrimination, zero share, flags), drafting a paper against the OMC CLO limits with only
// topics taught before the exam, version B with the same CLO and marks profile, the Excel sheet, splitting a past
// paper's text into questions, numerical tolerance, the bank PIN rules.

export const TYPES: [string, string][] = [
  ["MCQ", "MCQ (one answer)"], ["MCQ_MULTI", "MCQ (several answers)"], ["TRUE_FALSE", "True / false"], ["SHORT", "Short answer"],
  ["LONG", "Long answer"], ["NUMERICAL", "Numerical"], ["PROBLEM", "Problem"], ["CASE", "Case study"], ["CODE", "Coding (test cases)"], ["DIAGRAM", "Diagram / figure"],
];
export const TYPE_KEYS = TYPES.map(([k]) => k);
export const AUTO_MARKED = ["MCQ", "MCQ_MULTI", "TRUE_FALSE", "NUMERICAL", "CODE"];
export const VISIBILITY = ["PRIVATE", "COURSE", "CHOSEN"] as const;
export type Visibility = (typeof VISIBILITY)[number];
export const STATUS = ["DRAFT", "APPROVED", "REJECTED"] as const;
export const LOCK_TERMS = 3;
export const PIN_IDLE_MIN = 15;
export const PIN_MAX_TRIES = 5;
export const READY_PER_CLO_BLOOM = 3;

export type Part = { label: string; text: string; cloCode: string | null; marks: number; bloom: string | null; modelAnswer?: string | null };
export type Item = {
  id: string; courseCode: string; type: string; text: string; marks: number; cloCodes: string[]; bloom: string; difficulty: string; lectureNumber: number | null; week: number | null; topic: string;
  authorId: string; status: string; visibility: Visibility; sharedWith: string[]; parts: Part[]; minutes: number | null; lab: boolean; lockedUntil: number | null; usedCount: number;
  measuredDifficulty?: string | null; flags?: string[];
};

/** "Fall 2026" → a number that grows by one each term (Spring then Fall). */
export function termIndex(label: string | null | undefined): number | null {
  const m = String(label || "").match(/(spring|summer|fall|autumn|winter)\s*(\d{4})/i);
  if (!m) return null;
  const t = m[1].toLowerCase(); const y = Number(m[2]);
  return y * 2 + (t === "fall" || t === "autumn" || t === "winter" ? 1 : 0);
}
export const termLabel = (i: number) => `${i % 2 ? "Fall" : "Spring"} ${Math.floor(i / 2)}`;
/** A question used in a mid or final in `term` is locked until `LOCK_TERMS` terms later (quiz use never locks). */
export function lockAfterUse(examType: string, term: string): number | null {
  if (!/^(mid|final)/i.test(examType)) return null;
  const i = termIndex(term); return i === null ? null : i + LOCK_TERMS;
}
/** lockedUntil is the last locked term (used in Fall 2026 → locked through Spring 2028). */
export const isLocked = (lockedUntil: number | null | undefined, now: string) => { const i = termIndex(now); return lockedUntil != null && i !== null && i <= lockedUntil; };

// ---- who sees what
export type Viewer = { id: string; role: string; isSE: boolean; isPL: boolean; teachesCourse: boolean; grantedIds: Set<string>; reviewerOf: Set<string> };
/** Students never; the author always; reviewers (SE / Program Lead) and an official paper's vetting team see what they review. */
export function canSee(q: Pick<Item, "id" | "authorId" | "status" | "visibility" | "sharedWith">, v: Viewer): boolean {
  if (v.role === "STUDENT") return false;
  if (q.authorId === v.id) return true;
  if (v.reviewerOf.has(q.id) || v.grantedIds.has(q.id)) return true;
  if (q.visibility === "PRIVATE") return false;
  if (v.isSE || v.isPL) return true; // shared questions come to them for review
  if (q.status !== "APPROVED") return false;
  if (q.visibility === "COURSE") return v.teachesCourse;
  return q.sharedWith.includes(v.id);
}
/** Usable in papers and quizzes: approved, or the author's own private question in their own quiz / assignment. */
export function canUse(q: Pick<Item, "authorId" | "status" | "visibility">, userId: string, official: boolean) {
  if (q.status === "APPROVED") return true;
  return !official && q.authorId === userId && q.visibility === "PRIVATE" && q.status !== "REJECTED";
}

// ---- learning from use
export type ItemStat = { n: number; avgPct: number; discrimination: number | null; zeroPct: number; flags: string[]; measured: "EASY" | "MEDIUM" | "HARD" };
/** One question's results in one offering: each student's share of its marks and their share of the whole paper. */
export function itemStats(rows: { item: number; total: number }[]): ItemStat | null {
  const r = rows.filter((x) => Number.isFinite(x.item) && Number.isFinite(x.total));
  if (!r.length) return null;
  const avg = r.reduce((a, x) => a + x.item, 0) / r.length;
  const sorted = r.slice().sort((a, b) => b.total - a.total);
  const k = Math.max(1, Math.round(r.length * 0.27));
  const mean = (xs: typeof r) => xs.reduce((a, x) => a + x.item, 0) / (xs.length || 1);
  const discrimination = r.length >= 4 ? Math.round((mean(sorted.slice(0, k)) - mean(sorted.slice(-k))) * 100) / 100 : null;
  const avgPct = Math.round(avg * 1000) / 10;
  const flags: string[] = [];
  if (avgPct > 90) flags.push("TOO_EASY");
  if (avgPct < 30) flags.push("TOO_HARD");
  if (discrimination !== null && discrimination < 0.1) flags.push("AMBIGUOUS");
  return { n: r.length, avgPct, discrimination, zeroPct: Math.round((1000 * r.filter((x) => x.item <= 0).length) / r.length) / 10, flags, measured: avgPct >= 70 ? "EASY" : avgPct >= 40 ? "MEDIUM" : "HARD" };
}
export const FLAG_LABEL: Record<string, string> = { TOO_EASY: "Too easy", TOO_HARD: "Too hard", AMBIGUOUS: "Ambiguous", FAULTY: "Faulty" };

// ---- drafting a paper
export type DraftOpts = { total: number; minutes: number; cloShares: Record<string, number>; minCloPct: number; maxCloPct: number; bloom?: Record<string, number>; difficulty?: Record<string, number>; lastTaught: number | null; exclude: Set<string>; term: string };
export type Check = { ok: boolean; fails: string[]; notes: string[]; cloPct: Record<string, number>; minutes: number; total: number };
const shareOf = (q: Pick<Item, "cloCodes">, clo: string) => (q.cloCodes.includes(clo) ? 1 / q.cloCodes.length : 0);
export function paperCheck(qs: Item[], o: Pick<DraftOpts, "total" | "minutes" | "cloShares" | "minCloPct" | "maxCloPct" | "lastTaught">): Check {
  const total = qs.reduce((a, q) => a + q.marks, 0);
  const minutes = qs.reduce((a, q) => a + (q.minutes ?? Math.round(q.marks * 1.5)), 0);
  const clos = Object.keys(o.cloShares);
  const cloPct: Record<string, number> = {};
  for (const c of clos) cloPct[c] = total ? Math.round((1000 * qs.reduce((a, q) => a + q.marks * shareOf(q, c), 0)) / total) / 10 : 0;
  const fails: string[] = [], notes: string[] = [];
  if (Math.abs(total - o.total) > 0.01) fails.push(`Total ${total} of ${o.total} marks.`);
  for (const c of clos) {
    if (o.cloShares[c] > 0 && cloPct[c] < o.minCloPct) fails.push(`${c} has ${cloPct[c]}% (OMC minimum ${o.minCloPct}%).`);
    if (cloPct[c] > o.maxCloPct) fails.push(`${c} has ${cloPct[c]}% (OMC maximum ${o.maxCloPct}%).`);
  }
  const unmapped = qs.filter((q) => !q.cloCodes.length); if (unmapped.length) fails.push(`${unmapped.length} question(s) not mapped to a CLO.`);
  if (o.lastTaught !== null) { const late = qs.filter((q) => q.lectureNumber !== null && q.lectureNumber > o.lastTaught!); if (late.length) fails.push(`${late.length} question(s) on topics not taught before the exam.`); }
  if (minutes > o.minutes) fails.push(`Needs about ${minutes} minutes; the paper has ${o.minutes}.`);
  const topics = new Set(qs.map((q) => q.lectureNumber).filter((x) => x !== null)); notes.push(`${topics.size} topic(s) covered.`);
  const texts = qs.map((q) => q.text.toLowerCase().replace(/\W+/g, " ").trim()); if (new Set(texts).size < texts.length) fails.push("The same question appears twice.");
  return { ok: !fails.length, fails, notes, cloPct, minutes, total };
}

/**
 * Pick questions: per CLO its share of the marks (the OMC limits pre-fill the shares), only approved and usable,
 * unlocked, not excluded, on topics taught before the exam; least-used first, then the asked Bloom / difficulty mix.
 */
export function draftPaper(bank: Item[], o: DraftOpts): { chosen: Item[]; check: Check; gaps: string[] } {
  const pool = bank.filter((q) => !o.exclude.has(q.id) && !isLocked(q.lockedUntil, o.term) && q.cloCodes.length && (o.lastTaught === null || q.lectureNumber === null || q.lectureNumber <= o.lastTaught));
  const sumShares = Object.values(o.cloShares).reduce((a, b) => a + b, 0) || 1;
  const chosen: Item[] = []; const gaps: string[] = [];
  const want = (q: Item) => (o.bloom?.[q.bloom] || 0) + (o.difficulty?.[q.difficulty] || 0);
  const clos = Object.entries(o.cloShares).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  clos.forEach(([clo, s], idx) => {
    const target = idx === clos.length - 1 ? o.total - chosen.reduce((a, q) => a + q.marks, 0) : Math.round((o.total * s) / sumShares);
    let got = 0;
    const qs = pool.filter((q) => q.cloCodes[0] === clo && !chosen.includes(q)).sort((a, b) => a.usedCount - b.usedCount || want(b) - want(a) || b.marks - a.marks);
    for (const q of qs) if (got + q.marks <= target) { chosen.push(q); got += q.marks; }
    if (got < target) gaps.push(`${clo}: ${got} of ${target} marks — add more ${clo} questions (approved, unlocked, on taught topics)`);
  });
  chosen.sort((a, b) => (a.lectureNumber ?? 0) - (b.lectureNumber ?? 0));
  return { chosen, check: paperCheck(chosen, o), gaps };
}

/** Version B (C…): for every question an equivalent one — same CLO and marks, the same Bloom level and difficulty where possible. */
export function makeVariant(paper: Item[], bank: Item[], o: Pick<DraftOpts, "exclude" | "term" | "lastTaught">): { chosen: Item[]; missing: string[] } {
  const used = new Set(paper.map((q) => q.id).concat(Array.from(o.exclude)));
  const chosen: Item[] = []; const missing: string[] = [];
  paper.forEach((q, i) => {
    const cands = bank.filter((x) => !used.has(x.id) && !isLocked(x.lockedUntil, o.term) && x.cloCodes[0] === q.cloCodes[0] && x.marks === q.marks && (o.lastTaught === null || x.lectureNumber === null || x.lectureNumber <= o.lastTaught))
      .sort((a, b) => Number(b.bloom === q.bloom) - Number(a.bloom === q.bloom) || Number(b.difficulty === q.difficulty) - Number(a.difficulty === q.difficulty) || a.usedCount - b.usedCount);
    const x = cands[0];
    if (x) { chosen.push(x); used.add(x.id); } else { missing.push(`Q${i + 1} (${q.cloCodes[0]}, ${q.marks} marks)`); chosen.push(q); }
  });
  return { chosen, missing };
}
export const profile = (qs: Pick<Item, "cloCodes" | "marks">[]) => qs.map((q) => `${q.cloCodes[0]}:${q.marks}`).sort().join("|");

// ---- Excel sheet
export const SHEET_COLUMNS = ["Question", "Type", "Parts", "CLO", "Bloom", "Difficulty", "Marks", "Topic", "Answer", "Source"];
export type SheetRow = { row: number; text: string; type: string; parts: Part[]; cloCodes: string[]; bloom: string; difficulty: string; marks: number; topic: string; lectureNumber: number | null; answer: string; source: string; options: string[]; correct: number[] };
const BLOOMS = ["C1", "C2", "C3", "C4", "C5", "C6", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "A1", "A2", "A3", "A4", "A5"];
const normClo = (s: string) => { const n = String(s).replace(/\D/g, ""); return n ? `CLO-${Number(n)}` : ""; };
/**
 * Rows of the bank sheet → questions, with every problem by row ("Row 4: CLO-6 does not exist"). Options of an MCQ
 * are lines starting "a)", "b)" … in the question; the answer is the letter(s). Parts: "a) text [CLO-1, 4]; b) …".
 */
export function parseSheet(grid: string[][], ctx: { clos: string[]; lectures: { lectureNumber: number; topic: string }[] }): { rows: SheetRow[]; errors: string[] } {
  const errors: string[] = []; const rows: SheetRow[] = [];
  if (!grid.length) return { rows, errors: ["The sheet is empty."] };
  const head = grid[0].map((h) => String(h || "").trim().toLowerCase());
  const ix = (re: RegExp) => head.findIndex((h) => re.test(h));
  const c = { q: ix(/^question|^statement/), t: ix(/^type|^kind/), p: ix(/^parts?/), clo: ix(/^clo/), b: ix(/^bloom/), d: ix(/^diff/), m: ix(/^marks?/), top: ix(/^topic/), a: ix(/^answer|^model|^key/), s: ix(/^source/) };
  if (c.q < 0 || c.m < 0) return { rows, errors: [`Columns needed: ${SHEET_COLUMNS.join(", ")} (Question and Marks at least).`] };
  const clos = new Set(ctx.clos);
  grid.slice(1).forEach((r, i) => {
    const n = i + 2; const g = (k: number) => (k >= 0 ? String(r[k] ?? "").trim() : "");
    const raw = g(c.q); if (!raw) return;
    const errs: string[] = [];
    const typeIn = g(c.t).toUpperCase().replace(/[\s/-]+/g, "_");
    const type = TYPE_KEYS.find((k) => k === typeIn) || (/^(TF|T_F|TRUE_?FALSE)$/.test(typeIn) ? "TRUE_FALSE" : /^MCQ/.test(typeIn) ? "MCQ" : typeIn ? "" : "SHORT");
    if (!type) errs.push(`type "${g(c.t)}" is not one of ${TYPE_KEYS.join(", ")}`);
    const marks = Number(g(c.m)); if (!Number.isFinite(marks) || marks <= 0 || marks > 100) errs.push("no marks");
    const cloCodes = g(c.clo).split(/[,;/]/).map(normClo).filter(Boolean);
    for (const x of cloCodes) if (!clos.has(x)) errs.push(`${x} does not exist`);
    if (!cloCodes.length) errs.push("no CLO");
    const bloom = g(c.b).toUpperCase() || "C2"; if (!BLOOMS.includes(bloom)) errs.push(`Bloom level "${g(c.b)}" is not recognised`);
    const dIn = g(c.d).toUpperCase(); const difficulty = ["EASY", "MEDIUM", "HARD"].includes(dIn) ? dIn : dIn ? "" : "MEDIUM"; if (!difficulty) errs.push(`difficulty "${g(c.d)}" is not Easy / Medium / Hard`);
    const topicIn = g(c.top); let lectureNumber: number | null = null, topic = topicIn;
    if (topicIn) {
      const ln = topicIn.match(/^L?\s*(\d+)\b/i);
      const hit = ln ? ctx.lectures.find((l) => l.lectureNumber === Number(ln[1])) : ctx.lectures.find((l) => l.topic.toLowerCase() === topicIn.toLowerCase()) || ctx.lectures.find((l) => l.topic.toLowerCase().includes(topicIn.toLowerCase()));
      if (hit) { lectureNumber = hit.lectureNumber; topic = hit.topic; } else errs.push(`topic "${topicIn}" is not in the lecture plan`);
    }
    const lines = raw.split(/\r?\n/);
    const optRe = /^\s*\(?([a-hA-H])[).]\s+(.*)$/;
    const options = type.startsWith("MCQ") ? lines.filter((l) => optRe.test(l)).map((l) => l.match(optRe)![2].trim()) : type === "TRUE_FALSE" ? ["True", "False"] : [];
    const text = type.startsWith("MCQ") ? lines.filter((l) => !optRe.test(l)).join("\n").trim() : raw;
    const answer = g(c.a);
    let correct: number[] = [];
    if (type.startsWith("MCQ")) { correct = answer.toUpperCase().split(/[\s,;/]+/).filter(Boolean).map((x) => x.charCodeAt(0) - 65).filter((x) => x >= 0 && x < options.length); if (options.length < 2) errs.push("an MCQ needs options a), b) …"); if (!correct.length) errs.push("the answer letter is missing"); }
    if (type === "TRUE_FALSE") { const a = answer.toLowerCase(); correct = a.startsWith("t") ? [0] : a.startsWith("f") ? [1] : []; if (!correct.length) errs.push("the answer must be True or False"); }
    if (type === "NUMERICAL" && !Number.isFinite(Number(answer.split(/[±+]/)[0]))) errs.push("the numerical answer is missing");
    const parts: Part[] = g(c.p) ? g(c.p).split(/;\s*(?=\(?[a-z][).])/i).map((p) => { const m = p.match(/^\s*\(?([a-z])[).]\s*(.*?)\s*(?:\[([^\]]*)\])?\s*$/i); const tag = (m?.[3] || "").split(",").map((x) => x.trim()); return { label: (m?.[1] || "").toLowerCase(), text: m?.[2] || p.trim(), cloCode: normClo(tag[0] || "") || cloCodes[0] || null, marks: Number(tag[1]) || 0, bloom: null }; }) : [];
    for (const p of parts) if (p.cloCode && !clos.has(p.cloCode)) errs.push(`part ${p.label}: ${p.cloCode} does not exist`);
    if (parts.length && Math.abs(parts.reduce((a, p) => a + p.marks, 0) - marks) > 0.01) errs.push(`the parts' marks (${parts.reduce((a, p) => a + p.marks, 0)}) don't add up to ${marks}`);
    if (errs.length) { errors.push(`Row ${n}: ${errs.join("; ")}.`); return; }
    rows.push({ row: n, text, type, parts, cloCodes, bloom, difficulty, marks, topic, lectureNumber, answer, source: g(c.s), options, correct });
  });
  return { rows, errors };
}

// ---- splitting a paper's text into questions (the manual split, and the input to the AI)
const VERBS: Record<string, string[]> = {
  C1: ["define", "list", "state", "name", "recall", "identify", "label"], C2: ["explain", "describe", "summarize", "summarise", "discuss", "interpret", "classify", "differentiate"],
  C3: ["apply", "solve", "calculate", "compute", "use", "demonstrate", "implement", "find", "determine", "construct"], C4: ["analyze", "analyse", "compare", "contrast", "examine", "distinguish", "trace"],
  C5: ["evaluate", "justify", "assess", "critique", "argue", "judge", "recommend"], C6: ["design", "create", "develop", "propose", "formulate", "compose", "devise"],
};
export function bloomOf(text: string): string {
  // The command verb is the first verb of the question ("Define … and give one use" is C1).
  const w: string[] = text.toLowerCase().match(/[a-z]+/g) || [];
  for (const word of w) for (const lvl of ["C6", "C5", "C4", "C3", "C2", "C1"]) if (VERBS[lvl].includes(word)) return lvl;
  return "C2";
}
export type Split = { no: number; text: string; marks: number | null; parts: { label: string; text: string; marks: number | null }[] };
/** "Q1.", "Question 2", "3)" start a question; "(a)", "a)" a part; "(5 marks)", "[5]", "5 marks" the marks. */
export function splitPaper(text: string): Split[] {
  const t = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const marksOf = (s: string) => { const m = s.match(/[[(]\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)?\s*[\])]|(\d+(?:\.\d+)?)\s*marks?\b/i); return m ? Number(m[1] || m[2]) : null; };
  const strip = (s: string) => s.replace(/[[(]\s*\d+(?:\.\d+)?\s*(?:marks?|m)?\s*[\])]|\d+(?:\.\d+)?\s*marks?\b/gi, "").replace(/\s+/g, " ").trim();
  const starts = Array.from(t.matchAll(/(?:^|\n)\s*(?:Q(?:uestion)?\s*(?:No\.?\s*)?(\d+)\s*[:.)\-]?|(\d+)\s*[.)])\s+/gi));
  const out: Split[] = [];
  starts.forEach((m, i) => {
    const from = (m.index || 0) + m[0].length, to = i + 1 < starts.length ? starts[i + 1].index || t.length : t.length;
    const body = t.slice(from, to).trim(); if (!body) return;
    const segs = body.split(/\n\s*\(?([a-h])\)\s+/i);
    const parts: Split["parts"] = [];
    for (let k = 1; k + 1 < segs.length; k += 2) parts.push({ label: segs[k].toLowerCase(), text: strip(segs[k + 1]), marks: marksOf(segs[k + 1]) });
    const stem = segs[0];
    const pm = parts.reduce((a, p) => a + (p.marks || 0), 0);
    out.push({ no: Number(m[1] || m[2]) || out.length + 1, text: strip(stem), marks: marksOf(stem) ?? (pm || null), parts });
  });
  return out.filter((q) => q.text.length > 3 || q.parts.length);
}
/** Little text per page: a scanned paper (read by OCR / the AI) — its suggestions are lower-confidence. */
export const looksScanned = (text: string, pages: number) => text.replace(/\s+/g, "").length / Math.max(1, pages) < 200;

// ---- answers
export function numericCorrect(given: unknown, key: number, tol: number, mode: "ABS" | "PCT"): boolean {
  const g = Number(String(given ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(g) || String(given ?? "").trim() === "") return false;
  const allowed = mode === "PCT" ? Math.abs(key) * (tol / 100) : tol;
  return Math.abs(g - key) <= allowed + 1e-9;
}
/** The LaTeX in a text: $…$ inline and $$…$$ display. */
export function mathSegments(text: string): { math: boolean; display: boolean; text: string }[] {
  const out: { math: boolean; display: boolean; text: string }[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ math: false, display: false, text: text.slice(last, m.index) });
    out.push({ math: true, display: !!(m[1] || m[4]), text: (m[1] || m[2] || m[3] || m[4]).trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ math: false, display: false, text: text.slice(last) });
  return out;
}
/** Bank readiness: a course should have READY_PER_CLO_BLOOM approved questions per CLO per Bloom level it uses. */
export function readiness(items: Pick<Item, "cloCodes" | "bloom" | "status">[], used: { clo: string; bloom: string }[], per = READY_PER_CLO_BLOOM) {
  const short: { clo: string; bloom: string; have: number }[] = [];
  const seen = new Set<string>();
  for (const u of used) {
    const k = `${u.clo}|${u.bloom}`; if (seen.has(k)) continue; seen.add(k);
    const have = items.filter((q) => q.status === "APPROVED" && q.cloCodes.includes(u.clo) && q.bloom === u.bloom).length;
    if (have < per) short.push({ ...u, have });
  }
  return short;
}
