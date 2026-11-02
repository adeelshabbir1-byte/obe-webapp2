import { prisma } from "./db";
import { saveSetting } from "./scopedSettings";
import { courseCtx, isReviewer, items } from "./qbank";

// Student practice pool: questions the course's Subject Expert or Program Lead releases for self-practice. Released
// questions become known to students, so they are never drawn into a graded paper again (lib/qbank draft / variant
// filter them out). Stored per course code as an institute setting: qbank.practice.<code> = JSON list of item ids.
const db = prisma as unknown as Record<string, any>;
const keyOf = (code: string) => `qbank.practice.${code}`;
const J = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
type U = { id: string; role: string };

export async function poolFor(chairmanId: string, raw: unknown[]): Promise<Set<string>> {
  const codes = raw.map(String);
  if (!chairmanId || !codes.length) return new Set();
  const rows = ((await db.scopedSetting?.findMany({ where: { chairmanId, scopeType: "INSTITUTE", scopeId: chairmanId, key: { in: codes.map(keyOf) } } }).catch(() => [])) || []) as { value: string }[];
  return new Set(rows.flatMap((r) => J<string[]>(r.value, []).map(String)));
}

/** Release a question for practice, or take it back. Only approved, unlocked questions not in an adopted paper. */
export async function setPractice(u: U, courseId: string, itemId: string, on: boolean) {
  const ctx = await courseCtx(courseId);
  if (!isReviewer(ctx, u as never)) throw new Error("Only the course's Subject Expert or Program Lead releases questions for student practice.");
  const it = (await items(ctx.chairmanId, ctx.codes)).find((x) => x.id === itemId);
  if (!it || it.mcq) throw new Error("Question not found in this course's bank.");
  if (on) {
    if (it.status !== "APPROVED") throw new Error("Only approved questions can be released for practice.");
    if (it.lockedUntil) throw new Error("This question is locked after a final paper and cannot be released.");
    const adopted = ((await db.qbPaper?.findMany({ where: { status: "ADOPTED", itemIdsJson: { contains: itemId } }, select: { id: true } }).catch(() => [])) || []) as unknown[];
    if (adopted.length) throw new Error("This question is in an adopted paper; it cannot be released for practice.");
  }
  const cur = await poolFor(ctx.chairmanId, [it.courseCode]);
  if (on) cur.add(itemId); else cur.delete(itemId);
  await saveSetting(ctx.chairmanId, "INSTITUTE", ctx.chairmanId, keyOf(it.courseCode), JSON.stringify(Array.from(cur)), u.id);
  await prisma.auditLog.create({ data: { actorUserId: u.id, action: on ? "QBANK_PRACTICE_RELEASED" : "QBANK_PRACTICE_WITHDRAWN", entityType: "QuestionBankItem", entityId: itemId, metadata: { courseId } } }).catch(() => null);
  return { ok: true, practice: on };
}

export type PracticeQ = { id: string; text: string; type: string; cloCodes: string[]; topic: string; difficulty: string; options: string[]; correct: number[]; answer: string | null };

/** The practice questions of one of the student's own active courses, optionally for one CLO. */
export async function studentPractice(studentId: string, courseId: string, clo = "") {
  const en = await prisma.studentEnrollment.findFirst({ where: { studentId, courseId, status: "ACTIVE" }, select: { id: true } });
  if (!en) return null;
  const ctx = await courseCtx(courseId);
  const pool = await poolFor(ctx.chairmanId, ctx.codes);
  if (!pool.size) return { course: { id: courseId, code: ctx.course.code, title: ctx.course.title }, questions: [] as PracticeQ[], clos: [] as string[] };
  const all = (await items(ctx.chairmanId, ctx.codes)).filter((x) => pool.has(x.id) && !x.mcq && x.status === "APPROVED");
  const qs: PracticeQ[] = all.map((x) => ({
    id: x.id, text: x.text, type: x.type, cloCodes: x.cloCodes, topic: x.topic || "", difficulty: x.difficulty,
    options: J<string[]>(x.meta?.optionsJson, []), correct: x.ext?.correctJson ? J<number[]>(x.ext.correctJson, []) : x.meta?.correctIndex != null ? [Number(x.meta.correctIndex)] : [],
    answer: x.ext?.modelAnswer || (x.ext?.numericAnswer != null ? String(x.ext.numericAnswer) : null),
  }));
  const clos = Array.from(new Set(qs.flatMap((q) => q.cloCodes))).sort();
  return { course: { id: courseId, code: ctx.course.code, title: ctx.course.title }, questions: clo ? qs.filter((q) => q.cloCodes.includes(clo)) : qs, clos };
}

/** How many practice questions each CLO of a course has (for the student's My CLOs page). */
export async function practiceCounts(courseId: string): Promise<Record<string, number>> {
  try {
    const ctx = await courseCtx(courseId);
    const pool = await poolFor(ctx.chairmanId, ctx.codes);
    if (!pool.size) return {};
    const out: Record<string, number> = {};
    for (const x of await items(ctx.chairmanId, ctx.codes)) if (pool.has(x.id) && !x.mcq && x.status === "APPROVED") for (const c of x.cloCodes) out[c] = (out[c] || 0) + 1;
    return out;
  } catch { return {}; }
}
