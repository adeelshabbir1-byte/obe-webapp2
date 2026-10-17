import { prisma } from "./db";
import { parseCsv } from "./lmsImport";
import { resultLockMessage } from "./resultApproval";

export const mdb = prisma as unknown as Record<string, any>;
export type Q = { id: string; stem: string; optionsJson: string; correct: number; cloCode: string | null; topic: string | null; difficulty: string; bloom: string | null; explanation: string | null; active: boolean };
export type Quiz = { id: string; courseId: string; instrumentId: string | null; title: string; opensAt: Date; closesAt: Date; durationMin: number; pickJson: string; shuffle: boolean; showResults: boolean; negativePct: number; status: string };
export type Attempt = { id: string; quizId: string; studentId: string; questionIdsJson: string; orderJson: string; answersJson: string; startedAt: Date; submittedAt: Date | null; score: number | null; maxScore: number | null; perCloJson: string | null };
export const DIFF: [string, string][] = [["EASY", "Easy"], ["MEDIUM", "Medium"], ["HARD", "Hard"]];
export const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6"];
const LETTERS = "ABCDEF";

const shuffled = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** Questions of the bank this quiz draws from: fixed ids, or a random count per CLO (and "ANY" from the whole bank). */
export function pick(quiz: Quiz, bank: Q[]): string[] {
  let p: Record<string, unknown> = {}; try { p = JSON.parse(quiz.pickJson); } catch { p = {}; }
  const live = bank.filter((q) => q.active);
  if (Array.isArray(p.ids)) { const ok = new Set(live.map((q) => q.id)); const ids = (p.ids as string[]).filter((i) => ok.has(i)); return quiz.shuffle ? shuffled(ids) : ids; }
  const chosen: string[] = [];
  for (const [clo, n] of Object.entries(p)) {
    if (clo === "ANY") continue;
    chosen.push(...shuffled(live.filter((q) => (q.cloCode || "") === clo && !chosen.includes(q.id))).slice(0, Number(n) || 0).map((q) => q.id));
  }
  if (Number(p.ANY) > 0) chosen.push(...shuffled(live.filter((q) => !chosen.includes(q.id))).slice(0, Number(p.ANY)).map((q) => q.id));
  return quiz.shuffle ? shuffled(chosen) : chosen;
}

export function plannedCount(quiz: Pick<Quiz, "pickJson">) {
  try { const p = JSON.parse(quiz.pickJson); return Array.isArray(p.ids) ? p.ids.length : Object.values(p).reduce((s: number, n) => s + (Number(n) || 0), 0); } catch { return 0; }
}

export async function bankOf(chairmanId: string, courseCode: string): Promise<Q[]> {
  return (await mdb.mcqQuestion.findMany({ where: { chairmanId, courseCode }, orderBy: [{ cloCode: "asc" }, { createdAt: "asc" }] })) as Q[];
}

/** Score an attempt: 1 mark per question, optional negative marking for wrong (not blank) answers; per-CLO breakdown. */
export function grade(att: Attempt, questions: Q[], negativePct: number) {
  const ans = JSON.parse(att.answersJson || "{}") as Record<string, number>;
  const ids = JSON.parse(att.questionIdsJson) as string[];
  const qOf = new Map(questions.map((q) => [q.id, q]));
  let score = 0; const perClo: Record<string, [number, number]> = {};
  for (const id of ids) {
    const q = qOf.get(id); if (!q) continue;
    const c = q.cloCode || "—"; perClo[c] = perClo[c] || [0, 0]; perClo[c][1]++;
    if (ans[id] === undefined || ans[id] === null) continue;
    if (ans[id] === q.correct) { score++; perClo[c][0]++; } else score -= negativePct / 100;
  }
  return { score: Math.max(0, Math.round(score * 100) / 100), max: ids.length, perClo };
}

/** Grade, store, and copy the score into the linked assessment's marks (scaled), unless the result is locked. */
export async function finishAttempt(att: Attempt, quiz: Quiz) {
  const qs = (await mdb.mcqQuestion.findMany({ where: { id: { in: JSON.parse(att.questionIdsJson) } } })) as Q[];
  const g = grade(att, qs, quiz.negativePct);
  await mdb.quizAttempt.update({ where: { id: att.id }, data: { submittedAt: att.submittedAt || new Date(), score: g.score, maxScore: g.max, perCloJson: JSON.stringify(g.perClo) } });
  await pushMark(quiz, att.studentId, g.score, g.max);
  return g;
}

export async function pushMark(quiz: Quiz, studentId: string, score: number, max: number) {
  if (!quiz.instrumentId || !max) return false;
  if (await resultLockMessage(quiz.courseId)) return false;
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: quiz.instrumentId } });
  if (!inst || inst.courseId !== quiz.courseId) return false;
  const s = Math.round((score / max) * inst.maxScore * 100) / 100;
  const by = (await prisma.course.findUnique({ where: { id: quiz.courseId }, select: { instructorId: true } }))?.instructorId || "system";
  await prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId, instrumentId: inst.id } }, create: { studentId, courseId: quiz.courseId, instrumentId: inst.id, score: s, enteredById: by }, update: { score: s, enteredById: by } });
  return true;
}

/** An attempt still open after its time is up (plus a minute's grace) is submitted with whatever was saved. */
export const deadlineOf = (att: Pick<Attempt, "startedAt">, quiz: Pick<Quiz, "durationMin" | "closesAt">) => new Date(Math.min(att.startedAt.getTime() + quiz.durationMin * 60000, quiz.closesAt.getTime()));
export const expired = (att: Attempt, quiz: Quiz) => !att.submittedAt && Date.now() > deadlineOf(att, quiz).getTime() + 60000;

/** Item analysis: how many got each question right, discrimination (top 27% vs bottom 27%), and option spread. */
export function itemAnalysis(attempts: Attempt[], questions: Q[]) {
  const done = attempts.filter((a) => a.submittedAt && a.score !== null).sort((a, b) => (b.score! / (b.maxScore || 1)) - (a.score! / (a.maxScore || 1)));
  const k = Math.max(1, Math.round(done.length * 0.27));
  const top = new Set(done.slice(0, k).map((a) => a.id)), bot = new Set(done.slice(-k).map((a) => a.id));
  return questions.map((q) => {
    let seen = 0, right = 0, tr = 0, tn = 0, br = 0, bn = 0; const spread = (JSON.parse(q.optionsJson) as string[]).map(() => 0); let blank = 0;
    for (const a of done) {
      if (!(JSON.parse(a.questionIdsJson) as string[]).includes(q.id)) continue;
      seen++; const ans = (JSON.parse(a.answersJson) as Record<string, number>)[q.id];
      if (ans === undefined) blank++; else spread[ans] = (spread[ans] || 0) + 1;
      const ok = ans === q.correct; if (ok) right++;
      if (top.has(a.id)) { tn++; if (ok) tr++; } if (bot.has(a.id)) { bn++; if (ok) br++; }
    }
    const p = seen ? Math.round((100 * right) / seen) : null;
    const d = tn && bn ? Math.round(100 * (tr / tn - br / bn)) / 100 : null;
    return { id: q.id, seen, p, d, spread, blank, flag: p === null ? "" : p > 90 ? "Too easy" : p < 20 ? "Too hard / check key" : d !== null && d < 0.1 ? "Does not discriminate" : "" };
  });
}

/** Bank import from a spreadsheet saved as CSV: Question, A, B, C, D, (E, F), Answer (letter or number), CLO, Difficulty, Bloom, Topic, Explanation. */
export function parseBank(text: string): { rows: Omit<Q, "id" | "active">[]; errors: string[] } {
  const all = parseCsv(text); const errors: string[] = []; const rows: Omit<Q, "id" | "active">[] = [];
  if (!all.length) return { rows, errors: ["Empty file."] };
  const h = all[0].map((x) => x.trim().toLowerCase());
  const col = (re: RegExp) => h.findIndex((x) => re.test(x));
  const iQ = col(/^(question|stem|mcq)/), iAns = col(/^(answer|correct|key)/), iClo = col(/^clo/), iDiff = col(/^diff/), iBl = col(/^bloom/), iTop = col(/^topic/), iEx = col(/^expl/);
  const opt = ["a", "b", "c", "d", "e", "f"].map((l) => col(new RegExp(`^(option ?)?${l}$`))).filter((i) => i >= 0);
  if (iQ < 0 || iAns < 0 || opt.length < 2) return { rows, errors: ["Columns needed: Question, A, B (C, D…), Answer. Optional: CLO, Difficulty, Bloom, Topic, Explanation."] };
  all.slice(1).forEach((r, n) => {
    const stem = (r[iQ] || "").trim(); if (!stem) return;
    const options = opt.map((i) => (r[i] || "").trim()).filter(Boolean);
    const a = (r[iAns] || "").trim().toUpperCase();
    const correct = LETTERS.includes(a) && a ? LETTERS.indexOf(a) : Number(a) - 1;
    if (options.length < 2 || !(correct >= 0 && correct < options.length)) { errors.push(`Row ${n + 2}: needs 2+ options and a valid answer.`); return; }
    const d = (r[iDiff] || "").trim().toUpperCase();
    rows.push({ stem: stem.slice(0, 4000), optionsJson: JSON.stringify(options.map((o) => o.slice(0, 1000))), correct, cloCode: iClo >= 0 && r[iClo]?.trim() ? normClo(r[iClo]) : null, topic: iTop >= 0 ? r[iTop]?.trim().slice(0, 200) || null : null,
      difficulty: DIFF.some((x) => x[0] === d) ? d : "MEDIUM", bloom: iBl >= 0 && BLOOM.includes((r[iBl] || "").trim().toUpperCase()) ? r[iBl].trim().toUpperCase() : null, explanation: iEx >= 0 ? r[iEx]?.trim().slice(0, 2000) || null : null });
  });
  return { rows, errors };
}
export const normClo = (s: string) => { const n = String(s).replace(/\D/g, ""); return n ? `CLO-${Number(n)}` : String(s).trim().slice(0, 20); };
export const letter = (i: number) => LETTERS[i] || String(i + 1);

// Quiz times are entered and shown in Pakistan time (the server runs in UTC).
export const TZ = "Asia/Karachi";
export const parseLocal = (v: unknown) => { const s = String(v || ""); return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}${s.length === 16 ? ":00" : ""}+05:00`); };
export const fmt = (d: Date) => d.toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const inputValue = (d: Date) => new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 16);
