import { randomUUID, createHash, randomBytes } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { duplicates } from "./examBoardCore";
import {
  TYPE_KEYS, VISIBILITY, PIN_IDLE_MIN, PIN_MAX_TRIES, canSee, canUse, draftPaper, makeVariant, paperCheck, itemStats, lockAfterUse, isLocked, termIndex,
  parseSheet, splitPaper, bloomOf, looksScanned, readiness, type Item, type Part, type Viewer, type Visibility, type DraftOpts,
} from "./qbankCore";

// The question bank (Part 6, build A), extending QuestionBankItem + QbMeta (and showing the MCQ bank in the same
// search). The bank belongs to the base course of the course's content-sync group: every linked course shares it; the
// author's name stays for credit when a teacher leaves. The base course's Subject Expert adds directly; anyone else
// proposes — a shared question stays Draft until the SE or the Program Lead approves it (or approves with edits, or
// rejects with a reason). A question's author chooses who sees it: only themselves, the course's teachers, chosen
// colleagues, or one colleague with a time-limited access code. Used in a mid or final, a question is locked for three
// terms (SE / Program Lead unlock early with a reason). Results per question flag it too easy / too hard / ambiguous /
// faulty. Opening the bank asks for a second PIN, which times out after 15 minutes.

const db = prisma as unknown as Record<string, any>;
export const QB6_HINT = "Run prisma/migration_qbank.sql in Supabase first.";
type U = { id: string; role: string; name: string; managedById?: string | null };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const log = (actorId: string, action: string, itemId: string | null, detail = "") => db.qbLog.create({ data: { id: randomUUID(), itemId, actorId, action, detail: detail.slice(0, 1000) } }).catch(() => null);

// ---------------------------------------------------------------- the course and who is who
export async function courseCtx(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, subjectExpertId: true, instructorId: true, coordinatorId: true, coordinator: { select: { managedById: true } }, batch: { select: { startTerm: true, startYear: true } } } });
  if (!c) throw new Error("Course not found.");
  const m = await prisma.courseContentSyncMember.findUnique({ where: { courseId }, select: { groupId: true } });
  const members = m ? await prisma.courseContentSyncMember.findMany({ where: { groupId: m.groupId }, select: { courseId: true, isBase: true } }) : [];
  const baseId = members.find((x) => x.isBase)?.courseId || courseId;
  const linked = await prisma.course.findMany({ where: { id: { in: Array.from(new Set(members.map((x) => x.courseId).concat(courseId))) } }, select: { id: true, code: true, subjectExpertId: true, instructorId: true, coordinatorId: true } });
  const base = linked.find((x) => x.id === baseId) || c;
  const codes = Array.from(new Set(linked.map((x) => x.code).concat(c.code)));
  const chairmanId = c.coordinator.managedById || "";
  // The course's teachers: every section of the same course this institute runs.
  const sections = await prisma.course.findMany({ where: { code: { in: codes }, coordinator: { managedById: chairmanId }, instructorId: { not: null } }, select: { instructorId: true } });
  // No Subject Expert on the base (sections not linked in a sync group): the SE of the same course in this institute.
  let seId = base.subjectExpertId; let baseOut = baseId;
  if (!seId) {
    const withSe = await prisma.course.findFirst({ where: { code: { in: codes }, coordinator: { managedById: chairmanId }, subjectExpertId: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, subjectExpertId: true } });
    if (withSe) { seId = withSe.subjectExpertId; if (!m) baseOut = withSe.id; }
  }
  return { course: c, baseId: baseOut, codes, chairmanId, seId, plIds: Array.from(new Set(linked.map((x) => x.coordinatorId).concat(c.coordinatorId))), teacherIds: Array.from(new Set(sections.map((s) => s.instructorId!).concat(linked.map((x) => x.instructorId).filter((x): x is string => !!x)))) };
}
export type Ctx = Awaited<ReturnType<typeof courseCtx>>;
export const isReviewer = (ctx: Ctx, u: U) => u.id === ctx.seId || ctx.plIds.includes(u.id);
export function mayOpen(ctx: Ctx, u: U) {
  if (u.role === "STUDENT") return false;
  return u.id === ctx.seId || ctx.plIds.includes(u.id) || ctx.teacherIds.includes(u.id);
}

// ---------------------------------------------------------------- the bank
type Row = { id: string; courseCode: string; cloCode: string; bloom: string; kind: string; marks: number; text: string; usedCount: number; createdById: string; createdAt: Date };
export async function items(chairmanId: string, codes: string[]): Promise<(Item & { meta: Record<string, any>; ext: Record<string, any> | null; mcq?: boolean })[]> {
  const rows = (await db.questionBankItem.findMany({ where: { chairmanId, courseCode: { in: codes }, active: true }, orderBy: { createdAt: "asc" } })) as Row[];
  const ids = rows.map((r) => r.id).concat("none");
  const [metas, exts] = await Promise.all([db.qbMeta.findMany({ where: { itemId: { in: ids } } }).catch(() => []), db.qbExt.findMany({ where: { itemId: { in: ids } } }).catch(() => [])]);
  const mm = new Map((metas as { itemId: string }[]).map((x) => [x.itemId, x as Record<string, any>]));
  const em = new Map((exts as { itemId: string }[]).map((x) => [x.itemId, x as Record<string, any>]));
  const out = rows.map((r) => {
    const m = mm.get(r.id) || {}; const e = em.get(r.id) || null;
    const clos = J<string[]>(m.cloCodesJson, []);
    return {
      id: r.id, courseCode: r.courseCode, type: e?.type || r.kind || "SHORT", text: r.text, marks: r.marks, cloCodes: clos.length ? clos : [r.cloCode], bloom: r.bloom, difficulty: m.difficulty || "MEDIUM",
      lectureNumber: m.lectureNumber ?? null, week: m.week ?? null, topic: m.topic || "", authorId: r.createdById, status: e?.status || "APPROVED", visibility: (e?.visibility || "COURSE") as Visibility,
      sharedWith: J<string[]>(e?.sharedWithJson, []), parts: J<Part[]>(e?.partsJson, []), minutes: e?.minutes ?? null, lab: !!e?.lab, lockedUntil: e?.lockedUntil ?? null, usedCount: r.usedCount,
      measuredDifficulty: e?.measuredDifficulty ?? null, flags: J<string[]>(e?.flagsJson, []), meta: m, ext: e,
    };
  });
  // The MCQ bank shows in the same search (it is kept and managed as before).
  const mcqs = ((await db.mcqQuestion.findMany({ where: { chairmanId, courseCode: { in: codes }, active: true } }).catch(() => [])) as { id: string; courseCode: string; stem: string; optionsJson: string; correct: number; cloCode: string | null; topic: string | null; difficulty: string; bloom: string | null; createdById: string; explanation: string | null }[]);
  return out.concat(mcqs.map((q) => ({ id: `mcq:${q.id}`, courseCode: q.courseCode, type: "MCQ", text: q.stem, marks: 1, cloCodes: q.cloCode ? [q.cloCode] : [], bloom: q.bloom || "C2", difficulty: q.difficulty, lectureNumber: null, week: null, topic: q.topic || "", authorId: q.createdById, status: "APPROVED", visibility: "COURSE" as Visibility, sharedWith: [], parts: [], minutes: 1, lab: false, lockedUntil: null, usedCount: 0, measuredDifficulty: null, flags: [], meta: { optionsJson: q.optionsJson, correctIndex: q.correct, rubric: q.explanation }, ext: null, mcq: true })));
}

async function grantedIds(userId: string): Promise<Set<string>> {
  const now = new Date();
  const gs = (await db.qbGrant.findMany({ where: { revokedAt: null, OR: [{ granteeId: userId }, { usedById: userId }], AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] } }).catch(() => [])) as { itemIdsJson: string }[];
  return new Set(gs.flatMap((g) => J<string[]>(g.itemIdsJson, [])));
}
/** Private questions in an official paper this person reviews or vets: visible to them for that paper only. */
async function reviewerOf(u: U, ctx: Ctx): Promise<Set<string>> {
  const courseIds = (await prisma.course.findMany({ where: { code: { in: ctx.codes }, coordinator: { managedById: ctx.chairmanId } }, select: { id: true } })).map((c) => c.id);
  const papers = (await db.qbPaper.findMany({ where: { courseId: { in: courseIds.concat("none") }, status: "ADOPTED", examType: { in: ["Midterm", "Final"] } }, select: { courseId: true, itemIdsJson: true } }).catch(() => [])) as { courseId: string; itemIdsJson: string }[];
  if (!papers.length) return new Set();
  const out = new Set<string>();
  for (const p of papers) {
    const vetters = await vettingTeam(p.courseId);
    if (u.id === ctx.seId || ctx.plIds.includes(u.id) || vetters.includes(u.id)) J<string[]>(p.itemIdsJson, []).forEach((i) => out.add(i));
  }
  return out;
}
/** The paper vetting team of a course (whoever the vetting workflow asks): the HOD and the OMC of the department. */
async function vettingTeam(courseId: string): Promise<string[]> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { managedById: true, departmentId: true } } } });
  if (!c) return [];
  const us = await prisma.user.findMany({ where: { isActive: true, OR: [{ role: "HEAD_OF_DEPARTMENT" as never, departmentId: c.coordinator.departmentId || "none" }, { role: "OMC" as never, managedById: c.coordinator.managedById || "none" }] }, select: { id: true } });
  return us.map((x) => x.id);
}
export async function viewerFor(u: U, ctx: Ctx): Promise<Viewer> {
  return { id: u.id, role: u.role, isSE: u.id === ctx.seId, isPL: ctx.plIds.includes(u.id), teachesCourse: ctx.teacherIds.includes(u.id) || u.id === ctx.seId, grantedIds: await grantedIds(u.id), reviewerOf: await reviewerOf(u, ctx) };
}

/** What this person may see of the course's bank, with one search over text, topic, CLO and type. */
export async function visibleBank(u: U, courseId: string, q = "") {
  const ctx = await courseCtx(courseId);
  const v = await viewerFor(u, ctx);
  const s = q.trim().toLowerCase();
  const all = (await items(ctx.chairmanId, ctx.codes)).filter((x) => canSee(x, v));
  return { ctx, viewer: v, items: s ? all.filter((x) => `${x.text} ${x.topic} ${x.cloCodes.join(" ")} ${x.type} ${x.bloom}`.toLowerCase().includes(s)) : all };
}

// ---------------------------------------------------------------- adding, reviewing, sharing
export type NewQ = { text: string; type: string; marks: number; cloCodes: string[]; bloom: string; difficulty: string; lectureNumber: number | null; modelAnswer?: string; rubric?: string; options?: string[]; correct?: number[]; numericAnswer?: number | null; tolerance?: number | null; tolMode?: "ABS" | "PCT"; testCases?: { input: string; output: string }[]; parts?: Part[]; minutes?: number | null; sourceKind?: string; sourceNote?: string; visibility?: Visibility; sharedWith?: string[]; lab?: boolean; image?: { type: string; data: string } | null; aiDraft?: boolean };

async function planOfCourse(courseId: string) {
  // The Subject Expert's plan when it has anything (CLOs or lectures), else the teacher's copy.
  const own = (await prisma.lectureRow.count({ where: { courseId, source: "SE" } })) + (await prisma.cLO.count({ where: { courseId, source: "SE" } }));
  const src = own ? "SE" : "INSTRUCTOR";
  const [lectures, clos] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId, source: src }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, week: true, topic: true, clo: { select: { code: true } } } }),
    prisma.cLO.findMany({ where: { courseId, source: src }, orderBy: { orderIndex: "asc" }, select: { code: true, statement: true, bloomLevel: true } }),
  ]);
  return { lectures: lectures.map((l) => ({ lectureNumber: l.lectureNumber, week: l.week, topic: l.topic, clo: l.clo?.code || null })), clos };
}
export { planOfCourse };

export function clean(b: Record<string, any>, plan: Awaited<ReturnType<typeof planOfCourse>>): NewQ {
  const text = String(b.text || "").trim().slice(0, 12000);
  if (text.length < 3) throw new Error("Write the question.");
  const type = TYPE_KEYS.includes(String(b.type)) ? String(b.type) : "SHORT";
  const marks = Number(b.marks); if (!(marks > 0 && marks <= 100)) throw new Error("Give the marks (more than 0, at most 100).");
  const codes = new Set(plan.clos.map((c) => c.code));
  const cloCodes = (Array.isArray(b.cloCodes) ? b.cloCodes : String(b.cloCodes || b.cloCode || "").split(",")).map((x: unknown) => String(x).trim()).filter((x: string) => codes.has(x));
  if (!cloCodes.length) throw new Error("Map the question to a CLO of the course.");
  const lectureNumber = b.lectureNumber === "" || b.lectureNumber == null ? null : Number(b.lectureNumber);
  if (lectureNumber !== null && !plan.lectures.some((l) => l.lectureNumber === lectureNumber)) throw new Error("Link the question to a topic of the lecture plan.");
  const bloom = /^(C[1-6]|P[1-7]|A[1-5])$/.test(String(b.bloom)) ? String(b.bloom) : "C2";
  const difficulty = ["EASY", "MEDIUM", "HARD"].includes(String(b.difficulty).toUpperCase()) ? String(b.difficulty).toUpperCase() : "MEDIUM";
  const options = (Array.isArray(b.options) ? b.options : String(b.options || "").split("\n")).map((o: unknown) => String(o).trim()).filter(Boolean).slice(0, 8);
  const correct = (Array.isArray(b.correct) ? b.correct : String(b.correct ?? "").split(",")).map(Number).filter((n: number) => Number.isInteger(n) && n >= 0);
  if (type === "TRUE_FALSE") { options.splice(0, options.length, "True", "False"); if (!correct.length || correct[0] > 1) throw new Error("Choose True or False as the answer."); }
  if (type.startsWith("MCQ")) { if (options.length < 2) throw new Error("Give at least two options (one per line)."); if (!correct.length || correct.some((n: number) => n >= options.length)) throw new Error("Mark the correct option(s)."); if (type === "MCQ" && correct.length > 1) throw new Error("An MCQ with one answer has one correct option."); }
  const numericAnswer = b.numericAnswer === "" || b.numericAnswer == null ? null : Number(b.numericAnswer);
  if (type === "NUMERICAL" && !Number.isFinite(numericAnswer)) throw new Error("Give the numerical answer.");
  const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 12).map((p: Record<string, unknown>, i: number) => ({ label: String(p.label || String.fromCharCode(97 + i)).slice(0, 4), text: String(p.text || "").slice(0, 4000), cloCode: codes.has(String(p.cloCode)) ? String(p.cloCode) : cloCodes[0], marks: Number(p.marks) || 0, bloom: p.bloom ? String(p.bloom) : null, modelAnswer: p.modelAnswer ? String(p.modelAnswer).slice(0, 4000) : null }));
  if (parts.length && Math.abs(parts.reduce((a: number, p: Part) => a + p.marks, 0) - marks) > 0.01) throw new Error("The parts' marks must add up to the question's marks.");
  const visibility = (VISIBILITY as readonly string[]).includes(String(b.visibility)) ? (String(b.visibility) as Visibility) : "COURSE";
  return {
    text, type, marks, cloCodes, bloom, difficulty, lectureNumber, modelAnswer: String(b.modelAnswer || "").slice(0, 12000) || undefined, rubric: String(b.rubric || "").slice(0, 8000) || undefined, options, correct,
    numericAnswer, tolerance: b.tolerance === "" || b.tolerance == null ? null : Math.abs(Number(b.tolerance)) || 0, tolMode: b.tolMode === "PCT" ? "PCT" : "ABS",
    testCases: Array.isArray(b.testCases) ? b.testCases.slice(0, 20).map((t: Record<string, unknown>) => ({ input: String(t.input ?? ""), output: String(t.output ?? "") })) : undefined,
    parts, minutes: b.minutes ? Math.max(1, Math.min(300, Number(b.minutes))) : null, sourceKind: ["OWN", "BOOK", "PAST", "AI"].includes(String(b.sourceKind)) ? String(b.sourceKind) : "OWN", sourceNote: String(b.sourceNote || "").slice(0, 300) || undefined,
    visibility, sharedWith: (Array.isArray(b.sharedWith) ? b.sharedWith : []).map(String).slice(0, 50), lab: !!b.lab, image: b.image?.data ? { type: String(b.image.type), data: String(b.image.data).slice(0, 1_400_000) } : null, aiDraft: !!b.aiDraft,
  };
}

/** The base course's SE adds directly (approved); anyone else's shared question is a Draft for review. */
export async function addItem(u: U, courseId: string, b: Record<string, any>, opts: { force?: boolean; status?: string } = {}) {
  const ctx = await courseCtx(courseId);
  if (!mayOpen(ctx, u)) throw new Error("Only the course's Subject Expert, its teachers and the Program Lead use this bank.");
  const plan = await planOfCourse(ctx.baseId);
  const q = clean(b, plan);
  if (!opts.force) { const bank = await items(ctx.chairmanId, ctx.codes); const d = duplicates(q.text, bank.filter((x) => !x.mcq).map((x) => ({ id: x.id, text: x.text }))); if (d.length) return { duplicates: d }; }
  const id = randomUUID();
  const lec = plan.lectures.find((l) => l.lectureNumber === q.lectureNumber);
  const status = opts.status || (u.id === ctx.seId && !q.aiDraft ? "APPROVED" : "DRAFT");
  await db.questionBankItem.create({ data: { id, chairmanId: ctx.chairmanId, courseCode: ctx.course.code, cloCode: q.cloCodes[0], bloom: q.bloom, kind: q.type, marks: q.marks, text: q.text, usedCount: 0, active: true, createdById: u.id, createdAt: new Date() } });
  await db.qbMeta.create({ data: { itemId: id, lectureNumber: q.lectureNumber, week: lec?.week ?? null, topic: lec?.topic || "", difficulty: q.difficulty, cloCodesJson: JSON.stringify(q.cloCodes), rubric: q.rubric || q.modelAnswer || null, optionsJson: q.options?.length ? JSON.stringify(q.options) : null, correctIndex: q.correct?.[0] ?? null, codeSnippet: null, imageData: q.image?.data ?? null, imageType: q.image?.type ?? null, updatedById: u.id, updatedAt: new Date() } });
  await db.qbExt.create({ data: { itemId: id, baseCourseId: ctx.baseId, type: q.type, status, reviewedById: status === "APPROVED" ? u.id : null, reviewedAt: status === "APPROVED" ? new Date() : null, visibility: q.visibility, sharedWithJson: JSON.stringify(q.sharedWith || []), modelAnswer: q.modelAnswer || null, minutes: q.minutes, sourceKind: q.sourceKind, sourceNote: q.sourceNote || null, partsJson: JSON.stringify(q.parts || []), correctJson: q.correct?.length ? JSON.stringify(q.correct) : null, numericAnswer: q.numericAnswer, tolerance: q.tolerance, tolMode: q.tolMode, testCasesJson: q.testCases ? JSON.stringify(q.testCases) : null, lab: !!q.lab, aiDraft: !!q.aiDraft, updatedAt: new Date() } });
  await log(u.id, "ADDED", id, `${q.type} ${q.cloCodes.join(",")} ${q.marks} marks · ${q.visibility} · ${status}`);
  if (status === "DRAFT" && q.visibility !== "PRIVATE") await notifyUsers([ctx.seId, ...ctx.plIds], { kind: "REQUEST", title: `New question to review — ${ctx.course.code}`, body: `${u.name} proposed a ${q.type.toLowerCase().replace("_", " ")} question (${q.cloCodes.join(", ")}, ${q.marks} marks).`, href: `/question-bank?courseId=${courseId}&tab=review`, exceptId: u.id }).catch(() => null);
  return { id, status };
}

async function itemFor(id: string) {
  const r = await db.questionBankItem.findUnique({ where: { id } });
  if (!r || !r.active) throw new Error("Question not found.");
  const e = await db.qbExt.findUnique({ where: { itemId: id } });
  const course = await prisma.course.findFirst({ where: { id: e?.baseCourseId || undefined, code: e?.baseCourseId ? undefined : r.courseCode, coordinator: e?.baseCourseId ? undefined : { managedById: r.chairmanId } }, select: { id: true } });
  if (!course) throw new Error("The question's course is gone.");
  return { r, e, ctx: await courseCtx(course.id) };
}
async function ensureExt(id: string, ctx: Ctx, r: Row) {
  return db.qbExt.upsert({ where: { itemId: id }, create: { itemId: id, baseCourseId: ctx.baseId, type: r.kind || "SHORT", status: "APPROVED", visibility: "COURSE" }, update: {} });
}

/** The SE or the Program Lead: approve, approve with edits, or reject with a reason. */
export async function review(u: U, id: string, decision: "APPROVE" | "EDIT" | "REJECT", note: string, edits: Record<string, any> = {}) {
  const { r, ctx } = await itemFor(id);
  if (!isReviewer(ctx, u)) throw new Error("Only the course's Subject Expert or the Program Lead reviews questions.");
  if (decision === "REJECT" && note.trim().length < 3) throw new Error("Give the reason for rejecting it.");
  await ensureExt(id, ctx, r);
  if (decision === "EDIT") {
    const data: Record<string, unknown> = {};
    if (edits.text) data.text = String(edits.text).slice(0, 12000);
    if (Number(edits.marks) > 0) data.marks = Number(edits.marks);
    if (edits.bloom) data.bloom = String(edits.bloom);
    if (Object.keys(data).length) await db.questionBankItem.update({ where: { id }, data });
    if (edits.difficulty) await db.qbMeta.update({ where: { itemId: id }, data: { difficulty: String(edits.difficulty).toUpperCase() } }).catch(() => null);
    if (edits.modelAnswer) await db.qbExt.update({ where: { itemId: id }, data: { modelAnswer: String(edits.modelAnswer).slice(0, 12000) } });
  }
  const status = decision === "REJECT" ? "REJECTED" : "APPROVED";
  await db.qbExt.update({ where: { itemId: id }, data: { status, reviewedById: u.id, reviewedAt: new Date(), reviewNote: note.slice(0, 1000) || null, aiDraft: false, updatedAt: new Date() } });
  await log(u.id, decision === "REJECT" ? "REJECTED" : decision === "EDIT" ? "APPROVED_WITH_EDITS" : "APPROVED", id, note);
  await notifyUsers([r.createdById], { kind: "INFO", title: `Your ${ctx.course.code} question was ${status === "REJECTED" ? "not accepted" : decision === "EDIT" ? "approved with edits" : "approved"}`, body: note || undefined, href: `/question-bank?courseId=${ctx.course.id}`, exceptId: u.id }).catch(() => null);
  return { status };
}

/** The author chooses who sees it. Sharing a draft sends it for review; a private question in own quizzes needs none. */
export async function share(u: U, id: string, visibility: Visibility, sharedWith: string[]) {
  const { r, e, ctx } = await itemFor(id);
  if (r.createdById !== u.id) throw new Error("Only the question's author changes who sees it.");
  if (!(VISIBILITY as readonly string[]).includes(visibility)) throw new Error("Choose Private, Course teachers or Chosen teachers.");
  await ensureExt(id, ctx, r);
  await db.qbExt.update({ where: { itemId: id }, data: { visibility, sharedWithJson: JSON.stringify(visibility === "CHOSEN" ? sharedWith.slice(0, 50) : []), updatedAt: new Date() } });
  await log(u.id, "SHARED", id, `${visibility}${visibility === "CHOSEN" ? `: ${sharedWith.join(",")}` : ""}`);
  if (visibility !== "PRIVATE" && (e?.status || "APPROVED") === "DRAFT") await notifyUsers([ctx.seId, ...ctx.plIds], { kind: "REQUEST", title: `Shared question to review — ${ctx.course.code}`, body: `${u.name} shared a question with ${visibility === "COURSE" ? "the course's teachers" : "chosen colleagues"}.`, href: `/question-bank?courseId=${ctx.course.id}&tab=review`, exceptId: u.id }).catch(() => null);
  return { visibility };
}

const hashCode = (c: string) => createHash("sha256").update(c.trim().toUpperCase()).digest("hex");
/** An access code for one colleague: valid for some days, optionally for one quiz or assignment; revocable. */
export async function createCode(u: U, itemIds: string[], days: number, purpose: string) {
  const own = (await db.questionBankItem.findMany({ where: { id: { in: itemIds }, createdById: u.id, active: true }, select: { id: true } })) as { id: string }[];
  if (!own.length) throw new Error("Choose your own questions to share.");
  const code = randomBytes(5).toString("hex").toUpperCase();
  const id = randomUUID();
  await db.qbGrant.create({ data: { id, authorId: u.id, itemIdsJson: JSON.stringify(own.map((x) => x.id)), codeHash: hashCode(code), purpose: purpose.slice(0, 200) || null, expiresAt: new Date(Date.now() + Math.max(1, Math.min(90, days || 7)) * 86400000) } });
  for (const x of own) await log(u.id, "CODE_CREATED", x.id, `code ${id.slice(0, 8)} · ${days} day(s)${purpose ? ` · ${purpose}` : ""}`);
  return { id, code, count: own.length };
}
export async function redeemCode(u: U, code: string) {
  const g = await db.qbGrant.findFirst({ where: { codeHash: hashCode(code), revokedAt: null } });
  if (!g) throw new Error("That access code is not valid.");
  if (g.expiresAt && g.expiresAt < new Date()) throw new Error("That access code has expired.");
  if (g.usedById && g.usedById !== u.id) throw new Error("That access code was already used by another colleague.");
  if (g.authorId === u.id) throw new Error("That is your own code.");
  await db.qbGrant.update({ where: { id: g.id }, data: { usedById: u.id, usedAt: g.usedAt || new Date() } });
  const ids = J<string[]>(g.itemIdsJson, []);
  for (const i of ids) await log(u.id, "CODE_USED", i, `code ${g.id.slice(0, 8)}`);
  await notifyUsers([g.authorId], { kind: "INFO", title: "Your question access code was used", body: `${u.name} used your code for ${ids.length} question(s).`, exceptId: u.id }).catch(() => null);
  return { count: ids.length };
}
export async function revokeCode(u: U, grantId: string) {
  const g = await db.qbGrant.findUnique({ where: { id: grantId } });
  if (!g || g.authorId !== u.id) throw new Error("Not your code.");
  await db.qbGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
  for (const i of J<string[]>(g.itemIdsJson, [])) await log(u.id, "CODE_REVOKED", i, `code ${g.id.slice(0, 8)}`);
  return { revoked: true };
}
/** The author sees who used their questions and where. */
export async function usageOfMine(u: U) {
  const mine = ((await db.questionBankItem.findMany({ where: { createdById: u.id, active: true }, select: { id: true } })) as { id: string }[]).map((x) => x.id);
  const [logs, grants] = await Promise.all([
    db.qbLog.findMany({ where: { itemId: { in: mine.concat("none") }, actorId: { not: u.id } }, orderBy: { at: "desc" }, take: 100 }).catch(() => []),
    db.qbGrant.findMany({ where: { authorId: u.id }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => []),
  ]);
  const people = new Map((await prisma.user.findMany({ where: { id: { in: (logs as { actorId: string }[]).map((l) => l.actorId).concat((grants as { usedById: string | null }[]).map((g) => g.usedById || "none")) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  return { logs: (logs as { actorId: string; action: string; detail: string; at: Date; itemId: string }[]).map((l) => ({ ...l, who: people.get(l.actorId) || "" })), grants: (grants as { id: string; itemIdsJson: string; expiresAt: Date | null; revokedAt: Date | null; usedById: string | null; purpose: string | null; createdAt: Date }[]).map((g) => ({ id: g.id, count: J<string[]>(g.itemIdsJson, []).length, expiresAt: g.expiresAt, revokedAt: g.revokedAt, usedBy: g.usedById ? people.get(g.usedById) || "" : null, purpose: g.purpose, createdAt: g.createdAt })) };
}

// ---------------------------------------------------------------- the re-use lock
export async function unlock(u: U, id: string, reason: string) {
  const { r, ctx } = await itemFor(id);
  if (!isReviewer(ctx, u)) throw new Error("Only the Subject Expert or the Program Lead unlocks a question early.");
  if (reason.trim().length < 5) throw new Error("Give the reason for unlocking it early.");
  await ensureExt(id, ctx, r);
  await db.qbExt.update({ where: { itemId: id }, data: { lockedUntil: null, updatedAt: new Date() } });
  await log(u.id, "UNLOCKED", id, reason);
  await writeAuditLog({ actorUserId: u.id, action: "QB_QUESTION_UNLOCKED", entityType: "QuestionBankItem", entityId: id, metadata: { reason: reason.slice(0, 300), course: ctx.course.code } });
  return { unlocked: true };
}
/** Recorded when a paper is adopted: a mid or final use locks the question for three terms. */
export async function recordUse(u: U, itemIds: string[], courseId: string, examType: string, term: string, paperId: string | null) {
  const lock = lockAfterUse(examType, term);
  for (const [n, itemId] of itemIds.entries()) {
    if (itemId.startsWith("mcq:")) continue;
    await db.qbUse.create({ data: { id: randomUUID(), itemId, courseId, examType, termLabel: term, paperId, byUserId: u.id, questionNo: n + 1 } });
    const r = await db.questionBankItem.findUnique({ where: { id: itemId } });
    if (!r) continue;
    await db.questionBankItem.update({ where: { id: itemId }, data: { usedCount: { increment: 1 } } });
    if (lock !== null) {
      const ctx = await courseCtx(courseId);
      await ensureExt(itemId, ctx, r);
      const cur = await db.qbExt.findUnique({ where: { itemId } });
      if (!cur?.lockedUntil || cur.lockedUntil < lock) await db.qbExt.update({ where: { itemId }, data: { lockedUntil: lock, updatedAt: new Date() } });
    }
  }
}

// ---------------------------------------------------------------- learning from results
/** After marks: per question and offering — times used, class average, discrimination, zero share; flags; difficulty. */
export async function refreshStats(courseId: string) {
  const uses = (await db.qbUse.findMany({ where: { courseId } }).catch(() => [])) as { itemId: string; examType: string; termLabel: string; questionNo?: number | null }[];
  const out: Record<string, unknown>[] = [];
  for (const exam of Array.from(new Set(uses.map((x) => x.examType)))) {
    const insts = await prisma.assessmentInstrument.findMany({ where: { courseId, type: exam }, select: { id: true, label: true, maxScore: true, source: true } });
    if (!insts.length) continue;
    const marks = await prisma.studentMark.findMany({ where: { instrumentId: { in: insts.map((i) => i.id) } }, select: { studentId: true, instrumentId: true, score: true } });
    const maxOf = new Map(insts.map((i) => [i.id, i.maxScore || 0]));
    const totals = new Map<string, [number, number]>();
    for (const m of marks) { const t = totals.get(m.studentId) || [0, 0]; t[0] += m.score ?? 0; t[1] += maxOf.get(m.instrumentId) || 0; totals.set(m.studentId, t); }
    const faulty = new Set(((await db.cloItemMap?.findMany({ where: { instrumentId: { in: insts.map((i) => i.id) }, faulty: true }, select: { instrumentId: true } }).catch(() => [])) || []).map((x: { instrumentId: string }) => x.instrumentId));
    for (const u of uses.filter((x) => x.examType === exam)) {
      const n = u.questionNo; if (!n) continue;
      const inst = insts.find((i) => i.label === String(n) || new RegExp(`Q${n}$`).test(i.label));
      if (!inst || !inst.maxScore) continue;
      const rows = marks.filter((m) => m.instrumentId === inst.id && m.score !== null).map((m) => { const t = totals.get(m.studentId)!; return { item: (m.score as number) / inst.maxScore, total: t[1] ? t[0] / t[1] : 0 }; });
      const st = itemStats(rows); if (!st) continue;
      const flags = st.flags.concat(faulty.has(inst.id) ? ["FAULTY"] : []);
      const e = await db.qbExt.findUnique({ where: { itemId: u.itemId } });
      const hist = J<Record<string, unknown>>(e?.statsJson, {});
      hist[`${u.termLabel} ${exam}`] = { ...st, flags };
      const r = await db.questionBankItem.findUnique({ where: { id: u.itemId } });
      if (!r) continue;
      await ensureExt(u.itemId, await courseCtx(courseId), r);
      await db.qbExt.update({ where: { itemId: u.itemId }, data: { statsJson: JSON.stringify(hist), flagsJson: JSON.stringify(flags), measuredDifficulty: st.measured, updatedAt: new Date() } });
      out.push({ itemId: u.itemId, ...st, flags });
    }
  }
  return out;
}

// ---------------------------------------------------------------- drafting a paper
async function omcLimits(chairmanId: string, examType: string) {
  const { blueprintOf } = await import("./examBoard");
  const bp = await blueprintOf(chairmanId, examType === "Midterm" ? "Midterm" : "Final").catch(() => null);
  return { minCloPct: bp?.minCloPct ?? 10, maxCloPct: bp?.maxCloPct ?? 50 };
}
/** The last lecture taught before the exam date (from the teaching copy's dates, else the plan's weeks). */
export async function lastTaughtBefore(courseId: string, examDate: Date | null, examType: string): Promise<number | null> {
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { lectureNumber: true, actualDate: true, week: true } });
  if (examDate && rows.some((r) => r.actualDate)) { const before = rows.filter((r) => r.actualDate && r.actualDate < examDate); return before.length ? Math.max(...before.map((r) => r.lectureNumber)) : 0; }
  if (examType === "Midterm") { const plan = rows.length ? rows : await prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { lectureNumber: true, actualDate: true, week: true } }); const mid = plan.filter((r) => r.week <= 8); return mid.length ? Math.max(...mid.map((r) => r.lectureNumber)) : null; }
  return null;
}
/** The term the course offering is taught in ("Fall 2026"): its stamped term, its batch + semester, the program's current term, else today's. */
export async function currentTerm(courseId: string) {
  const { courseTermIndex, termLabel, currentTermIndexFor } = await import("./courseTerm");
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { semesterNumber: true, offeredTermName: true, offeredTermYear: true, coordinatorId: true, batch: { select: { startTerm: true, startYear: true } } } });
  const i = c ? courseTermIndex(c) ?? (await currentTermIndexFor(c.coordinatorId).catch(() => null)) : null;
  if (i !== null && i !== undefined) return termLabel(i);
  const d = new Date(); return `${d.getUTCMonth() < 6 ? "Spring" : "Fall"} ${d.getUTCFullYear()}`;
}

export async function draft(u: U, courseId: string, b: Record<string, any>) {
  const ctx = await courseCtx(courseId);
  if (!mayOpen(ctx, u)) throw new Error("forbidden");
  const examType = b.examType === "Midterm" ? "Midterm" : "Final";
  const term = await currentTerm(courseId);
  const plan = await planOfCourse(ctx.baseId);
  const lim = await omcLimits(ctx.chairmanId, examType);
  const lastTaught = b.allTopics ? null : await lastTaughtBefore(courseId, b.examDate ? new Date(String(b.examDate)) : null, examType);
  const recentTerms = Math.max(0, Number(b.excludeTerms ?? 1));
  const tIdx = termIndex(term);
  const recentUse = new Set(((await db.qbUse.findMany({ where: { courseId: { in: (await prisma.course.findMany({ where: { code: { in: ctx.codes } }, select: { id: true } })).map((c) => c.id) } } }).catch(() => [])) as { itemId: string; termLabel: string }[]).filter((x) => { const i = termIndex(x.termLabel); return i !== null && tIdx !== null && tIdx - i < recentTerms; }).map((x) => x.itemId));
  const v = await viewerFor(u, ctx);
  const practice = await (await import("./practicePool")).poolFor(ctx.chairmanId, ctx.codes);
  const bank = (await items(ctx.chairmanId, ctx.codes)).filter((x) => !x.mcq && x.type !== "MCQ_MULTI" && canSee(x, v) && canUse(x, u.id, true) && !practice.has(x.id));
  const clos = plan.clos.map((c) => c.code);
  const shares: Record<string, number> = b.cloShares && typeof b.cloShares === "object" ? Object.fromEntries(Object.entries(b.cloShares).map(([k, x]) => [k, Number(x) || 0])) : Object.fromEntries(clos.map((c) => [c, 1]));
  const opts: DraftOpts = { total: Number(b.total) || (examType === "Midterm" ? 30 : 50), minutes: Number(b.minutes) || (examType === "Midterm" ? 90 : 180), cloShares: shares, ...lim, bloom: b.bloom, difficulty: b.difficulty, lastTaught, exclude: recentUse, term };
  const r = draftPaper(bank, opts);
  const id = randomUUID();
  await db.qbPaper.create({ data: { id, courseId, examType, termLabel: term, variant: "A", itemIdsJson: JSON.stringify(r.chosen.map((q) => q.id)), optsJson: JSON.stringify({ ...opts, exclude: Array.from(opts.exclude) }), checkJson: JSON.stringify({ ...r.check, gaps: r.gaps }), status: "DRAFT", createdById: u.id } });
  return { id, chosen: r.chosen, check: r.check, gaps: r.gaps, lastTaught, term };
}
export async function paperOf(paperId: string) {
  const p = await db.qbPaper.findUnique({ where: { id: paperId } });
  if (!p) throw new Error("Paper not found.");
  const ctx = await courseCtx(p.courseId);
  const all = await items(ctx.chairmanId, ctx.codes);
  const ids = J<string[]>(p.itemIdsJson, []);
  return { p, ctx, all, questions: ids.map((i) => all.find((x) => x.id === i)).filter((x): x is NonNullable<typeof x> => !!x), opts: J<DraftOpts & { exclude: string[] }>(p.optsJson, {} as never) };
}
/** Version B (C…): equivalent questions, the same CLO and marks profile. */
export async function variant(u: U, paperId: string) {
  const { p, ctx, all, questions, opts } = await paperOf(paperId);
  if (!mayOpen(ctx, u)) throw new Error("forbidden");
  const v = await viewerFor(u, ctx);
  const siblings = (await db.qbPaper.findMany({ where: { OR: [{ id: p.parentId || p.id }, { parentId: p.parentId || p.id }] } })) as { itemIdsJson: string; variant: string }[];
  const taken = new Set(siblings.flatMap((s) => J<string[]>(s.itemIdsJson, [])));
  const practice = await (await import("./practicePool")).poolFor(ctx.chairmanId, ctx.codes);
  const r = makeVariant(questions, all.filter((x) => !x.mcq && canSee(x, v) && canUse(x, u.id, true) && !practice.has(x.id)), { exclude: taken, term: p.termLabel, lastTaught: opts.lastTaught ?? null });
  const letter = String.fromCharCode(65 + siblings.length);
  const id = randomUUID();
  const check = paperCheck(r.chosen, { ...opts, cloShares: opts.cloShares || {} });
  await db.qbPaper.create({ data: { id, courseId: p.courseId, examType: p.examType, termLabel: p.termLabel, variant: letter, parentId: p.parentId || p.id, itemIdsJson: JSON.stringify(r.chosen.map((q) => q.id)), optsJson: p.optsJson, checkJson: JSON.stringify({ ...check, missing: r.missing }), status: "DRAFT", createdById: u.id } });
  return { id, variant: letter, chosen: r.chosen, missing: r.missing, check };
}
/** The drafted paper becomes the course's mid or final paper: the question plan (each question mapped to its CLO and topic) and the paper vetting draft. */
export async function adopt(u: U, paperId: string) {
  const { p, ctx, questions } = await paperOf(paperId);
  const c = await prisma.course.findUniqueOrThrow({ where: { id: p.courseId }, select: { id: true, instructorId: true, subjectExpertId: true } });
  if (c.instructorId !== u.id && c.subjectExpertId !== u.id) throw new Error("Only the course's teacher (or its Subject Expert) adopts a paper.");
  const chk = J<{ ok: boolean; fails: string[] }>(p.checkJson, { ok: false, fails: [] });
  if (!chk.ok) throw new Error(`The paper does not pass its checks yet: ${chk.fails.join(" ")}`);
  const source = c.instructorId === u.id ? "INSTRUCTOR" : "SE";
  if (source === "INSTRUCTOR") { const { ensureInstructorCopy } = await import("./instructorCopy"); await ensureInstructorCopy(c.id); }
  const [lectures, clos] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId: c.id, source }, select: { id: true, lectureNumber: true, topic: true } }),
    prisma.cLO.findMany({ where: { courseId: c.id, source }, select: { id: true, code: true } }),
  ]);
  const lid = new Map(lectures.map((l) => [l.lectureNumber, l])), cid = new Map(clos.map((x) => [x.code, x.id]));
  await prisma.paperDistributionItem.deleteMany({ where: { courseId: c.id, source, examType: p.examType } });
  const created: { id: string; text: string }[] = [];
  for (const [i, q] of questions.entries()) {
    const it = await prisma.paperDistributionItem.create({ data: { courseId: c.id, source, examType: p.examType, questionNo: i + 1, orderIndex: i, lectureRowId: q.lectureNumber !== null ? lid.get(q.lectureNumber)?.id || null : null, topicText: q.topic || lid.get(q.lectureNumber ?? -1)?.topic || "—", cloId: cid.get(q.cloCodes[0]) || null, cognitiveLevel: q.bloom, marks: q.marks } });
    const opts = J<string[]>(q.meta?.optionsJson, []);
    created.push({ id: it.id, text: q.text + (q.parts.length ? `\n${q.parts.map((x) => `(${x.label}) ${x.text} [${x.marks}]`).join("\n")}` : "") + (opts.length ? `\n${opts.map((o, k) => `(${String.fromCharCode(97 + k)}) ${o}`).join("\n")}` : "") });
  }
  if (created.some((x) => !x.id)) throw new Error("Could not write the question plan.");
  const qj = JSON.stringify(Object.fromEntries(created.map((x) => [x.id, x.text])));
  const v = await db.paperVetting.findUnique({ where: { courseId_examType: { courseId: c.id, examType: p.examType } } }).catch(() => null);
  if (!v) await db.paperVetting.create({ data: { courseId: c.id, examType: p.examType, status: "DRAFT", questionsJson: qj } }).catch(() => null);
  else if (["DRAFT", "RETURNED"].includes(v.status)) await db.paperVetting.update({ where: { id: v.id }, data: { questionsJson: qj } }).catch(() => null);
  await db.qbPaper.update({ where: { id: paperId }, data: { status: "ADOPTED" } });
  await recordUse(u, questions.map((q) => q.id), c.id, p.examType, p.termLabel, paperId);
  await writeAuditLog({ actorUserId: u.id, action: "QB_PAPER_ADOPTED", entityType: "Course", entityId: c.id, metadata: { examType: p.examType, variant: p.variant, questions: questions.length } });
  return { adopted: true, questions: questions.length, ctx: ctx.course.code };
}

// ---------------------------------------------------------------- getting questions in
export async function sheetPreview(u: U, courseId: string, grid: string[][]) {
  const ctx = await courseCtx(courseId);
  if (!mayOpen(ctx, u)) throw new Error("forbidden");
  const plan = await planOfCourse(ctx.baseId);
  return parseSheet(grid, { clos: plan.clos.map((c) => c.code), lectures: plan.lectures });
}
export async function sheetImport(u: U, courseId: string, grid: string[][]) {
  const pv = await sheetPreview(u, courseId, grid);
  if (pv.errors.length) return { error: "Nothing was saved — fix these first.", problems: pv.errors };
  let added = 0, dup = 0;
  for (const r of pv.rows) {
    const res = await addItem(u, courseId, { text: r.text, type: r.type, marks: r.marks, cloCodes: r.cloCodes, bloom: r.bloom, difficulty: r.difficulty, lectureNumber: r.lectureNumber, modelAnswer: r.type.startsWith("MCQ") || r.type === "TRUE_FALSE" ? undefined : r.answer, options: r.options, correct: r.correct, numericAnswer: r.type === "NUMERICAL" ? Number(r.answer.split(/[±+]/)[0]) : null, tolerance: r.type === "NUMERICAL" && /±/.test(r.answer) ? Number(r.answer.split("±")[1]) : null, parts: r.parts, sourceKind: r.source ? (/past|mid|final/i.test(r.source) ? "PAST" : /book|ch/i.test(r.source) ? "BOOK" : "OWN") : "OWN", sourceNote: r.source });
    if ("duplicates" in res) dup++; else added++;
  }
  return { added, duplicates: dup };
}
/** The mid and final questions already in the system (question plans + paper vetting texts) become bank questions. */
export async function pastPapersToBank(u: U, courseId: string) {
  const ctx = await courseCtx(courseId);
  if (!isReviewer(ctx, u) && !ctx.teacherIds.includes(u.id)) throw new Error("forbidden");
  const courses = await prisma.course.findMany({ where: { code: { in: ctx.codes }, coordinator: { managedById: ctx.chairmanId } }, select: { id: true, batch: { select: { batchName: true } } } });
  const existing = new Set((await items(ctx.chairmanId, ctx.codes)).map((x) => x.text.trim().toLowerCase()));
  let added = 0, skipped = 0;
  for (const c of courses) {
    const qs = await prisma.paperDistributionItem.findMany({ where: { courseId: c.id, examType: { in: ["Midterm", "Final"] } }, orderBy: [{ examType: "asc" }, { questionNo: "asc" }], include: { clo: { select: { code: true } }, lectureRow: { select: { lectureNumber: true } } } });
    if (!qs.length) continue;
    const vet = new Map<string, Record<string, string>>();
    for (const ex of ["Midterm", "Final"]) { const v = await db.paperVetting.findUnique({ where: { courseId_examType: { courseId: c.id, examType: ex } } }).catch(() => null); vet.set(ex, J<Record<string, string>>(v?.questionsJson, {})); }
    for (const q of qs) {
      const text = (vet.get(q.examType || "")?.[q.id] || "").trim();
      if (!text || !q.clo || existing.has(text.toLowerCase())) { skipped++; continue; }
      const res = await addItem(u, courseId, { text, type: "LONG", marks: q.marks, cloCodes: [q.clo.code], bloom: q.cognitiveLevel || "C2", difficulty: "MEDIUM", lectureNumber: q.lectureRow?.lectureNumber ?? null, sourceKind: "PAST", sourceNote: `${q.examType} ${c.batch?.batchName || ""} Q${q.questionNo}`.trim(), modelAnswer: "" }, { force: true, status: isReviewer(ctx, u) ? "APPROVED" : "DRAFT" }).catch(() => null);
      if (res && "id" in res) { added++; existing.add(text.toLowerCase()); await db.qbUse.create({ data: { id: randomUUID(), itemId: res.id, courseId: c.id, examType: q.examType || "Final", termLabel: c.batch?.batchName || "", byUserId: u.id, questionNo: q.questionNo } }).catch(() => null); } else skipped++;
    }
  }
  if (added) await refreshStats(courseId).catch(() => null);
  return { added, skipped };
}

/** A past paper's PDF → one suggested question per item (type, topic, CLO, Bloom, difficulty, duplicates); nothing saved. */
export async function analysePdf(u: U, courseId: string, buf: Buffer) {
  const ctx = await courseCtx(courseId);
  if (!mayOpen(ctx, u)) throw new Error("forbidden");
  const { extractPdfText } = await import("./pdfText");
  const { PDFDocument } = await import("pdf-lib");
  const ex = await extractPdfText(buf);
  const parsed = { text: ex.ok ? ex.text : "", numpages: await PDFDocument.load(buf, { ignoreEncryption: true }).then((d) => d.getPageCount()).catch(() => 1) };
  const scanned = looksScanned(parsed.text, parsed.numpages);
  const plan = await planOfCourse(ctx.baseId);
  let splits = splitPaper(parsed.text);
  let ai: { model: string; costUsd: number; cached: boolean } | null = null;
  if (scanned || !splits.length) {
    // A scan (or a layout the manual split can't read): the AI reads the PDF itself, if it is set up.
    const r = await import("./aiChecks").then((m) => m.paperSplit(u, ctx.chairmanId, buf.toString("base64"))).catch(() => null);
    if (r?.questions?.length) { splits = r.questions; ai = { model: r.model, costUsd: r.costUsd, cached: r.cached }; }
  }
  const { topicSimilarity } = await import("./catalogCore");
  const bank = (await items(ctx.chairmanId, ctx.codes)).filter((x) => !x.mcq);
  const rows = splits.map((s) => {
    const full = [s.text, ...s.parts.map((p) => p.text)].join(" ");
    const best = plan.lectures.map((l) => ({ l, sim: topicSimilarity(full, l.topic) })).sort((a, b) => b.sim - a.sim)[0];
    const lec = best && best.sim > 0.05 ? best.l : null;
    const bloom = bloomOf(full);
    const isMcq = /\n\s*\(?[a-d][).]\s/i.test(s.text) && s.parts.length === 0 && (s.marks ?? 1) <= 2;
    return {
      no: s.no, snippet: full.slice(0, 600), text: s.text, parts: s.parts.map((p) => ({ label: p.label, text: p.text, marks: p.marks || 0, cloCode: lec?.clo || plan.clos[0]?.code || null, bloom: bloomOf(p.text) })), marks: s.marks,
      type: isMcq ? "MCQ" : /\bcalculate|compute|find the value|solve\b/i.test(full) ? "NUMERICAL" : s.parts.length ? "LONG" : full.length > 300 ? "LONG" : "SHORT",
      lectureNumber: lec?.lectureNumber ?? null, topic: lec?.topic || "", cloCode: lec?.clo || plan.clos[0]?.code || null, bloom, difficulty: ["C1", "C2"].includes(bloom) ? "EASY" : ["C3", "C4"].includes(bloom) ? "MEDIUM" : "HARD",
      duplicates: duplicates(s.text, bank.map((x) => ({ id: x.id, text: x.text }))).slice(0, 3),
    };
  });
  return { scanned, warning: scanned ? "This looks like a scanned paper: the text was read by OCR / the AI, so check every suggestion (handwriting especially)." : null, rows, ai, pages: parsed.numpages, plan: { clos: plan.clos.map((c) => c.code), lectures: plan.lectures } };
}
/** The reviewed rows saved as Drafts for the SE / Program Lead's review. */
export async function saveAnalysed(u: U, courseId: string, rows: Record<string, any>[]) {
  let added = 0; const problems: string[] = [];
  for (const r of rows.slice(0, 200)) {
    const res = await addItem(u, courseId, { ...r, aiDraft: true, sourceKind: r.sourceKind || "PAST", visibility: r.visibility || "COURSE" }, { force: true, status: "DRAFT" }).catch((e) => { problems.push(`Q${r.no ?? added + 1}: ${(e as Error).message}`); return null; });
    if (res && "id" in res) added++;
  }
  return { added, problems };
}

// ---------------------------------------------------------------- readiness
export async function bankShortfall(courseId: string) {
  const ctx = await courseCtx(courseId);
  const plan = await planOfCourse(ctx.baseId);
  const used = plan.clos.map((c) => ({ clo: c.code, bloom: c.bloomLevel || "C2" }));
  return readiness(await items(ctx.chairmanId, ctx.codes), used);
}

// ---------------------------------------------------------------- the bank PIN
async function hodsOf(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true, managedById: true } });
  return u?.departmentId ? (await prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT" as never, departmentId: u.departmentId, isActive: true }, select: { id: true } })).map((x) => x.id) : [];
}
// The unlock belongs to this browser session (an httpOnly cookie matching the token saved with the PIN), not to the user.
const PIN_COOKIE = "qb_pin";
async function cookieToken() { try { const { cookies } = await import("next/headers"); return cookies().get(PIN_COOKIE)?.value || ""; } catch { return ""; } }
async function startSession(userId: string) {
  const token = randomBytes(18).toString("hex");
  await db.qbPin.update({ where: { userId }, data: { sessionToken: token, lastActiveAt: new Date(), failed: 0 } });
  try { const { cookies } = await import("next/headers"); cookies().set(PIN_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 }); } catch { /* not in a request */ }
}
export async function pinState(userId: string) {
  const p = await db.qbPin.findUnique({ where: { userId } }).catch(() => null);
  if (!p) return { set: false, unlocked: false, failed: 0 };
  const fresh = !!p.lastActiveAt && Date.now() - new Date(p.lastActiveAt).getTime() < PIN_IDLE_MIN * 60000;
  const mine = !!p.sessionToken && p.sessionToken === (await cookieToken());
  return { set: true, unlocked: fresh && mine && p.failed < PIN_MAX_TRIES, failed: p.failed, blocked: p.failed >= PIN_MAX_TRIES };
}
/** Every bank action keeps the PIN session alive; 15 minutes without one and the PIN is asked again. */
export async function touchPin(userId: string) { await db.qbPin.update({ where: { userId }, data: { lastActiveAt: new Date() } }).catch(() => null); }
export async function requirePin(userId: string) { const s = await pinState(userId); if (!s.unlocked) throw Object.assign(new Error(s.set ? "Enter your question-bank PIN." : "Set your question-bank PIN first."), { pin: true }); await touchPin(userId); }
const okPin = (pin: string) => /^\d{4,8}$/.test(pin);
export async function setPin(u: U, pin: string, password: string) {
  if (!okPin(pin)) throw new Error("The PIN is 4 to 8 digits.");
  const { verifyPassword, hashPassword } = await import("./auth");
  const me = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { passwordHash: true } });
  const cur = await db.qbPin.findUnique({ where: { userId: u.id } }).catch(() => null);
  // Setting the first PIN, or "Forgot PIN": the account password confirms it is you.
  if (!(await verifyPassword(me.passwordHash, password))) throw new Error("Your account password is not right.");
  const pinHash = await hashPassword(pin);
  await db.qbPin.upsert({ where: { userId: u.id }, create: { userId: u.id, pinHash, failed: 0 }, update: { pinHash, failed: 0, updatedAt: new Date() } });
  await startSession(u.id);
  await writeAuditLog({ actorUserId: u.id, action: cur ? "QB_PIN_RESET" : "QB_PIN_SET", entityType: "User", entityId: u.id, metadata: {} });
  return { set: true };
}
export async function verifyPin(u: U, pin: string) {
  const p = await db.qbPin.findUnique({ where: { userId: u.id } });
  if (!p) throw new Error("Set your question-bank PIN first.");
  if (p.failed >= PIN_MAX_TRIES) throw new Error("Too many wrong PINs — reset it with \"Forgot PIN\" (your account password).");
  const { verifyPassword } = await import("./auth");
  if (await verifyPassword(p.pinHash, pin)) { await startSession(u.id); return { unlocked: true }; }
  const failed = p.failed + 1;
  await db.qbPin.update({ where: { userId: u.id }, data: { failed, lastActiveAt: null } });
  await writeAuditLog({ actorUserId: u.id, action: "QB_PIN_WRONG", entityType: "User", entityId: u.id, metadata: { attempt: failed } });
  if (failed >= PIN_MAX_TRIES) {
    const hods = await hodsOf(u.id);
    await notifyUsers([u.id, ...hods], { kind: "ALERT", title: "Question bank: 5 wrong PINs", body: `${u.name}'s question-bank PIN was entered wrongly ${failed} times. The bank is blocked for them until the PIN is reset.` }).catch(() => null);
  }
  throw new Error(failed >= PIN_MAX_TRIES ? "Wrong PIN — 5 wrong attempts: you and your HOD have been told; reset it with \"Forgot PIN\"." : `Wrong PIN (${PIN_MAX_TRIES - failed} attempt(s) left).`);
}
export { isLocked };
