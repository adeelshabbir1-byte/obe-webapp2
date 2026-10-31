import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { LEAD_MANAGER_ROLES, loadTeams, syncApprovedPaper, type Team } from "./courseTeams";
import {
  BLOOM_LEVELS, DEFAULT_BLUEPRINT, DIFFICULTIES, KINDS, avgStars, blueprintCheck, complete, consensus, deriveSlots, duplicates, mappingTable, ratingError,
  type BQ, type Blueprint, type Candidate, type Decision, type Difficulty, type PaperQ, type Slot,
} from "./examBoardCore";

// Collaborative question bank and peer-reviewed exam papers for a course team (sections of one course taught by two or
// more teachers, lib/courseTeams.ts). Teachers add questions with their topic, CLOs, difficulty and Bloom level; each
// builds a draft paper that must pass the blueprint; everyone rates the proposed questions 1–5 stars; the consensus
// paper takes the highest rated question per slot; the Course Lead breaks ties, adjusts and publishes — the official
// paper goes to every section's question plan with its exam-to-CLO mapping. Every step is in the audit log.

const db = prisma as unknown as Record<string, any>;
export const EB_HINT = "The exam board needs prisma/migration_exam_board.sql — run it in Supabase.";
export const BLUEPRINT_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR"];
type U = { id: string; role: string; name?: string };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const examOf = (v: unknown) => (v === "Midterm" || v === "Final" ? v : null);

// ---------------- team and its course plan
export async function teamFor(chairmanId: string, key: string) { return (await loadTeams(chairmanId)).find((t) => t.key === key) || null; }
export const isTeacher = (t: Team, userId: string) => t.teachers.some((x) => x.id === userId);
export const canView = (t: Team, u: U) => isTeacher(t, u.id) || LEAD_MANAGER_ROLES.includes(u.role) || u.role === "SUPER_USER";
const leadRow = (t: Team) => (t.leadId ? t.rows.find((r) => r.teachers.some((x) => x.id === t.leadId)) : null) || null;

/** The course whose lecture plan and CLOs the team works from (the Lead's section, else the first), with its codes. */
export async function planOf(t: Team) {
  const base = leadRow(t)?.courseId || t.rows[0].courseId;
  const ids = t.rows.map((r) => r.courseId);
  const [courses, hasOwn] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: ids } }, select: { code: true, courseType: true, coordinator: { select: { managedById: true } } } }),
    prisma.cLO.count({ where: { courseId: base, source: "INSTRUCTOR" } }),
  ]);
  const source = hasOwn ? "INSTRUCTOR" : "SE";
  const [lectures, clos, boundary] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId: base, source }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, week: true, topic: true } }),
    prisma.cLO.findMany({ where: { courseId: base, source }, orderBy: { orderIndex: "asc" }, select: { code: true, statement: true, bloomLevel: true } }),
    import("./finalBoundary").then((m) => m.computeFinalBoundary(base, source as "SE" | "INSTRUCTOR")).catch(() => null),
  ]);
  const midtermWeek = (boundary as { midtermWeek?: number } | null)?.midtermWeek ?? 8;
  return { baseCourseId: base, codes: Array.from(new Set(courses.map((c) => c.code))), courseType: courses[0]?.courseType || "", lectures, clos, midtermWeek };
}
export type Plan = Awaited<ReturnType<typeof planOf>>;

/** The CLOs an exam must assess: those of the lectures it covers (midterm: before the midterm week). */
export function requiredClos(plan: Plan, examType: string, lectureClo: Map<number, string>) {
  const lec = plan.lectures.filter((l) => (examType === "Midterm" ? l.week < plan.midtermWeek : true));
  const set = new Set(lec.map((l) => lectureClo.get(l.lectureNumber)).filter((x): x is string => !!x));
  // No lecture→CLO links in the plan: nothing to require (the coverage rules of the paper check still apply).
  return plan.clos.map((c) => c.code).filter((c) => set.has(c));
}
async function lectureCloMap(courseId: string) {
  const own = await prisma.lectureRow.count({ where: { courseId, source: "INSTRUCTOR" } });
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: own ? "INSTRUCTOR" : "SE", cloId: { not: null } }, select: { lectureNumber: true, clo: { select: { code: true } } } });
  return new Map(rows.filter((r) => r.clo).map((r) => [r.lectureNumber, r.clo!.code]));
}

// ---------------- bank
export type BankQ = BQ & { rubric: string | null; options: string[]; correctIndex: number | null; codeSnippet: string | null; hasImage: boolean; createdAt: Date; usedCount: number; complete: boolean };
export async function bankOf(chairmanId: string, codes: string[]): Promise<BankQ[]> {
  const items = (await db.questionBankItem.findMany({ where: { chairmanId, courseCode: { in: codes }, active: true }, orderBy: { createdAt: "asc" } })) as { id: string; text: string; marks: number; kind: string; cloCode: string; bloom: string; createdById: string; createdAt: Date; usedCount: number }[];
  const metas = (await db.qbMeta.findMany({ where: { itemId: { in: items.map((i) => i.id) } } }).catch(() => [])) as { itemId: string; lectureNumber: number | null; week: number | null; topic: string; difficulty: string; cloCodesJson: string; rubric: string | null; optionsJson: string | null; correctIndex: number | null; codeSnippet: string | null; imageData: string | null }[];
  const m = new Map(metas.map((x) => [x.itemId, x]));
  return items.map((i) => {
    const x = m.get(i.id);
    const clos = x ? J<string[]>(x.cloCodesJson, []) : [];
    const q: BQ = { id: i.id, text: i.text, marks: i.marks, kind: i.kind, difficulty: x && (DIFFICULTIES as readonly string[]).includes(x.difficulty) ? (x.difficulty as Difficulty) : null, cloCodes: clos.length ? clos : x ? [i.cloCode] : [], bloom: i.bloom, lectureNumber: x?.lectureNumber ?? null, week: x?.week ?? null, topic: x?.topic || "", authorId: i.createdById };
    return { ...q, rubric: x?.rubric ?? null, options: J<string[]>(x?.optionsJson, []), correctIndex: x?.correctIndex ?? null, codeSnippet: x?.codeSnippet ?? null, hasImage: !!x?.imageData, createdAt: i.createdAt, usedCount: i.usedCount, complete: complete(q) };
  });
}
export async function imageOf(itemId: string) { return (await db.qbMeta.findUnique({ where: { itemId }, select: { imageData: true, imageType: true } }).catch(() => null)) as { imageData: string | null; imageType: string | null } | null; }

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export type QInput = { text: string; marks: number; kind: string; bloom: string; difficulty: string; cloCodes: string[]; lectureNumber: number; rubric?: string; options?: string[]; correctIndex?: number | null; codeSnippet?: string; image?: { type: string; data: string } | null };
/** Checks the mandatory metadata against the course plan. Returns the cleaned question or throws. */
export function cleanQuestion(plan: Plan, b: Record<string, any>): QInput & { week: number | null; topic: string } {
  const text = String(b.text || "").trim().slice(0, 8000), marks = Number(b.marks);
  if (text.length < 5) throw new Error("Write the question statement.");
  if (!Number.isFinite(marks) || marks <= 0 || marks > 100) throw new Error("Give the question's marks (more than 0, at most 100).");
  const kind = KINDS.some(([k]) => k === b.kind) ? String(b.kind) : "SHORT";
  const lectureNumber = Number(b.lectureNumber), lec = plan.lectures.find((l) => l.lectureNumber === lectureNumber);
  if (!lec) throw new Error("Link the question to a topic of the lecture plan.");
  const codes = new Set(plan.clos.map((c) => c.code));
  const cloCodes = Array.from(new Set((Array.isArray(b.cloCodes) ? b.cloCodes : String(b.cloCodes || "").split(",")).map((x: unknown) => String(x).trim()).filter((c: string) => codes.has(c))));
  if (!cloCodes.length) throw new Error("Tag the question to at least one CLO of the course.");
  const difficulty = String(b.difficulty || "").toUpperCase();
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) throw new Error("Choose the difficulty: Easy, Medium or Hard.");
  const bloom = String(b.bloom || "");
  if (!BLOOM_LEVELS.includes(bloom)) throw new Error("Choose the Bloom level (Remembering … Creating).");
  const options = (Array.isArray(b.options) ? b.options : String(b.options || "").split("\n")).map((o: unknown) => String(o).trim()).filter(Boolean).slice(0, 8);
  const rubric = String(b.rubric || "").trim().slice(0, 8000);
  let correctIndex: number | null = null;
  if (kind === "MCQ") {
    if (options.length < 2) throw new Error("A multiple-choice question needs at least two options (one per line).");
    correctIndex = Number(b.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) throw new Error("Mark which option is correct.");
  } else if (rubric.length < 3) throw new Error("Give the rubric or model answer (how the question is marked).");
  let image: QInput["image"] = null;
  if (b.image?.data) {
    if (!IMAGE_TYPES.includes(String(b.image.type))) throw new Error("The diagram must be a PNG, JPEG, WebP or GIF image.");
    if (String(b.image.data).length > 1_400_000) throw new Error("The diagram is larger than 1 MB.");
    image = { type: String(b.image.type), data: String(b.image.data) };
  }
  return { text, marks, kind, bloom, difficulty, cloCodes, lectureNumber, week: lec.week, topic: lec.topic, rubric: rubric || undefined, options, correctIndex, codeSnippet: String(b.codeSnippet || "").slice(0, 8000) || undefined, image };
}

/** Adds a question to the course's bank. Unless forced, a near-duplicate stops it and the similar ones come back. */
export async function addQuestion(u: U, chairmanId: string, plan: Plan, courseCode: string, b: Record<string, any>) {
  const q = cleanQuestion(plan, b);
  const bank = await bankOf(chairmanId, plan.codes);
  if (!b.force) { const d = duplicates(q.text, bank); if (d.length) return { duplicates: d }; }
  const id = randomUUID();
  await db.questionBankItem.create({ data: { id, chairmanId, courseCode, cloCode: q.cloCodes[0], bloom: q.bloom, kind: q.kind, marks: q.marks, text: q.text, usedCount: 0, active: true, createdById: u.id, createdAt: new Date() } });
  await db.qbMeta.create({ data: metaData(id, q, u.id, b.force ? duplicates(q.text, bank)[0]?.id ?? null : null) });
  await writeAuditLog({ actorUserId: u.id, action: "QB_QUESTION_ADDED", entityType: "QuestionBankItem", entityId: id, metadata: { course: courseCode, clos: q.cloCodes.join(","), difficulty: q.difficulty, bloom: q.bloom, despiteDuplicate: !!b.force } });
  return { id };
}
const metaData = (itemId: string, q: ReturnType<typeof cleanQuestion>, by: string, dupOf: string | null) => ({
  itemId, lectureNumber: q.lectureNumber, week: q.week, topic: q.topic, difficulty: q.difficulty, cloCodesJson: JSON.stringify(q.cloCodes), rubric: q.rubric ?? null,
  optionsJson: q.options?.length ? JSON.stringify(q.options) : null, correctIndex: q.correctIndex ?? null, codeSnippet: q.codeSnippet ?? null,
  imageData: q.image?.data ?? null, imageType: q.image?.type ?? null, duplicateOfId: dupOf, updatedById: by, updatedAt: new Date(),
});

/** The author edits their question (or completes an old one's metadata). Ratings given in open rounds are cleared. */
export async function editQuestion(u: U, chairmanId: string, plan: Plan, id: string, b: Record<string, any>) {
  const it = await db.questionBankItem.findFirst({ where: { id, chairmanId, active: true } });
  if (!it) throw new Error("Question not found.");
  if (it.createdById !== u.id) throw new Error("Only the teacher who wrote it can change a question (the Course Lead adjusts the final paper).");
  const old = (await db.qbMeta.findUnique({ where: { itemId: id } }).catch(() => null)) as { imageData: string | null; imageType: string | null } | null;
  const q = cleanQuestion(plan, { ...b, image: b.image?.data ? b.image : b.removeImage ? null : old?.imageData ? { type: old.imageType, data: old.imageData } : null });
  await db.questionBankItem.update({ where: { id }, data: { text: q.text, marks: q.marks, kind: q.kind, bloom: q.bloom, cloCode: q.cloCodes[0] } });
  await db.qbMeta.upsert({ where: { itemId: id }, create: metaData(id, q, u.id, null), update: { ...metaData(id, q, u.id, null), duplicateOfId: undefined } });
  const open = (await db.examFinal.findMany({ where: { chairmanId, status: "PUBLISHED" }, select: { teamKey: true, examType: true } })) as { teamKey: string; examType: string }[];
  const cleared = await db.qbRating.deleteMany({ where: { itemId: id, ...(open.length ? { NOT: open.map((o) => ({ teamKey: o.teamKey, examType: o.examType })) } : {}) } });
  await writeAuditLog({ actorUserId: u.id, action: "QB_QUESTION_EDITED", entityType: "QuestionBankItem", entityId: id, metadata: { before: String(it.text).slice(0, 400), after: q.text.slice(0, 400), ratingsCleared: cleared.count } });
  return { ratingsCleared: cleared.count as number };
}

// ---------------- blueprint
export async function blueprintOf(chairmanId: string, examType: string): Promise<Blueprint> {
  const r = await db.examBlueprint.findUnique({ where: { chairmanId_examType: { chairmanId, examType } } }).catch(() => null);
  return r ? { easyPct: r.easyPct, mediumPct: r.mediumPct, hardPct: r.hardPct, tolerancePct: r.tolerancePct, minCloPct: r.minCloPct, maxCloPct: r.maxCloPct } : DEFAULT_BLUEPRINT;
}
export async function saveBlueprint(u: U, chairmanId: string, examType: string, b: Record<string, any>) {
  if (!BLUEPRINT_ROLES.includes(u.role)) throw new Error("The OMC, the Chairman, the Dean or the HOD sets the exam blueprint.");
  const n = (k: keyof Blueprint) => { const v = Number(b[k]); if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error("Percentages are 0–100."); return v; };
  const bp: Blueprint = { easyPct: n("easyPct"), mediumPct: n("mediumPct"), hardPct: n("hardPct"), tolerancePct: n("tolerancePct"), minCloPct: n("minCloPct"), maxCloPct: n("maxCloPct") };
  if (Math.round(bp.easyPct + bp.mediumPct + bp.hardPct) !== 100) throw new Error("Easy, Medium and Hard must add up to 100%.");
  if (bp.minCloPct > bp.maxCloPct) throw new Error("The minimum CLO share can't be above the maximum.");
  await db.examBlueprint.upsert({ where: { chairmanId_examType: { chairmanId, examType } }, create: { id: randomUUID(), chairmanId, examType, ...bp, updatedById: u.id }, update: { ...bp, updatedById: u.id, updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: u.id, action: "EXAM_BLUEPRINT_SET", entityType: "ExamBlueprint", entityId: `${chairmanId}:${examType}`, metadata: { examType, ...bp } });
}
async function minQuestions(chairmanId: string, courseType: string, examType: string) {
  const r = await import("./examQuestions").then((m) => m.questionRulesFor(chairmanId, courseType)).catch(() => null);
  return r ? (examType === "Midterm" ? r.midterm : r.final) : 0;
}

// ---------------- the round: drafts, ratings, consensus
type DraftRow = { id: string; authorId: string; itemIdsJson: string; status: string; checkJson: string | null; submittedAt: Date | null };
type FinalRow = { id: string; status: string; decisionsJson: string; extraJson: string; removedJson: string; editsJson: string; paperJson: string | null; publishedAt: Date | null; publishedById: string | null; leadCourseId: string | null };
export type Edits = Record<string, { text?: string; marks?: number }>;

export async function round(chairmanId: string, t: Team, examType: string) {
  const plan = await planOf(t);
  const [bank, drafts, ratings, final, bp, minQ, lcm] = await Promise.all([
    bankOf(chairmanId, plan.codes),
    db.examDraft.findMany({ where: { chairmanId, teamKey: t.key, examType } }) as Promise<DraftRow[]>,
    db.qbRating.findMany({ where: { chairmanId, teamKey: t.key, examType } }) as Promise<{ itemId: string; raterId: string; stars: number; comment: string | null; updatedAt: Date }[]>,
    db.examFinal.findUnique({ where: { chairmanId_teamKey_examType: { chairmanId, teamKey: t.key, examType } } }) as Promise<FinalRow | null>,
    blueprintOf(chairmanId, examType),
    minQuestions(chairmanId, plan.courseType, examType),
    lectureCloMap(plan.baseCourseId),
  ]);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const submitted = drafts.filter((d) => d.status === "SUBMITTED");
  const proposed = Array.from(new Set(submitted.flatMap((d) => J<string[]>(d.itemIdsJson, [])))).filter((id) => byId.has(id));
  const rated = new Map<string, { raterId: string; stars: number; comment: string | null }[]>();
  for (const r of ratings) rated.set(r.itemId, [...(rated.get(r.itemId) || []), r]);
  const candidates: Candidate[] = proposed.map((id) => { const s = (rated.get(id) || []).map((r) => r.stars); return { ...byId.get(id)!, avg: avgStars(s), n: s.length }; });
  // Slots: the team's question plan (the Lead's paper distribution for this exam), else per CLO from the drafts.
  const lr = leadRow(t);
  const dist = lr ? await prisma.paperDistributionItem.findMany({ where: { courseId: lr.courseId, source: "INSTRUCTOR", examType }, orderBy: [{ orderIndex: "asc" }, { questionNo: "asc" }], select: { questionNo: true, topicText: true, marks: true, clo: { select: { code: true } }, lectureRow: { select: { lectureNumber: true } } } }) : [];
  const fromPlan = dist.length > 0 && final?.status !== "PUBLISHED";
  const removed = new Set(J<string[]>(final?.removedJson, []));
  const extra = J<{ key: string; itemId: string }[]>(final?.extraJson, []);
  const base: Slot[] = fromPlan
    ? dist.map((d) => ({ key: `Q${d.questionNo}`, label: `Q${d.questionNo} · ${d.clo?.code || "no CLO"}${d.lectureRow ? ` · L${d.lectureRow.lectureNumber}` : ""} · ${d.topicText}`, clo: d.clo?.code || null, lectureNumber: d.lectureRow?.lectureNumber ?? null, marks: d.marks }))
    : deriveSlots(submitted.map((d) => J<string[]>(d.itemIdsJson, []).filter((id) => byId.has(id))), byId);
  const slots = [...base.filter((s) => !removed.has(s.key)), ...extra.map((x) => ({ key: x.key, label: `Added by the Course Lead`, clo: null, lectureNumber: null, marks: null }))];
  const decisions = J<Record<string, Decision>>(final?.decisionsJson, {});
  for (const x of extra) if (!decisions[x.key]) decisions[x.key] = { itemId: x.itemId, by: t.leadId || "", at: "", kind: "ADDED" };
  const picks = consensus(slots, candidates, decisions);
  const edits = J<Edits>(final?.editsJson, {});
  const paper: PaperQ[] = picks.filter((p) => p.itemId && byId.has(p.itemId)).map((p, i) => { const q = byId.get(p.itemId!)!; return { no: i + 1, id: q.id, text: edits[q.id]?.text ?? q.text, marks: edits[q.id]?.marks ?? p.slot.marks ?? q.marks, difficulty: q.difficulty, cloCodes: q.cloCodes, bloom: q.bloom, lectureNumber: q.lectureNumber, topic: q.topic }; });
  const required = requiredClos(plan, examType, lcm);
  const ctx = { requiredClos: required, minQuestions: minQ, midtermWeek: plan.midtermWeek, examType };
  const check = blueprintCheck(paper.map((q) => ({ ...q, week: byId.get(q.id)?.week ?? null, difficulty: q.difficulty as Difficulty | null })), bp, ctx);
  return { plan, bank, byId, drafts, submitted, proposed, candidates, rated, slots, fromPlan, picks, decisions, edits, paper, check, final, bp, ctx, published: final?.status === "PUBLISHED" };
}
export type Round = Awaited<ReturnType<typeof round>>;

function needTeacher(t: Team, u: U) { if (!isTeacher(t, u.id)) throw new Error("Only the teachers of this course team can do this."); }
function needOpen(r: Round) { if (r.published) throw new Error("This paper is published and locked (the Course Lead can reopen it)."); }
function needLead(t: Team, u: U) { if (!t.leadId) throw new Error("No Course Lead has been named for this team yet."); if (t.leadId !== u.id) throw new Error("Only the Course Lead can do this."); }

/** A teacher's draft: questions from the bank (new ones are added to the bank first). Saving returns it to draft. */
export async function saveDraft(u: U, chairmanId: string, t: Team, examType: string, itemIds: string[]) {
  needTeacher(t, u);
  const r = await round(chairmanId, t, examType);
  needOpen(r);
  const ids = Array.from(new Set(itemIds.map(String))).filter((id) => r.byId.has(id)).slice(0, 60);
  const incomplete = ids.filter((id) => !r.byId.get(id)!.complete);
  if (incomplete.length) throw new Error(`${incomplete.length} chosen question(s) lack a topic, CLO, difficulty or Bloom level — their author completes them first.`);
  await db.examDraft.upsert({ where: { chairmanId_teamKey_examType_authorId: { chairmanId, teamKey: t.key, examType, authorId: u.id } }, create: { id: randomUUID(), chairmanId, teamKey: t.key, examType, authorId: u.id, itemIdsJson: JSON.stringify(ids), status: "DRAFT" }, update: { itemIdsJson: JSON.stringify(ids), status: "DRAFT", updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: u.id, action: "EXAM_DRAFT_SAVED", entityType: "ExamDraft", entityId: `${t.key}:${examType}`, metadata: { examType, questions: ids.length } });
  return draftCheck(r, ids);
}
export function draftCheck(r: Round, ids: string[]) {
  const qs = ids.map((id) => r.byId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
  return blueprintCheck(qs, r.bp, r.ctx);
}
export async function submitDraft(u: U, chairmanId: string, t: Team, examType: string) {
  needTeacher(t, u);
  const r = await round(chairmanId, t, examType);
  needOpen(r);
  const d = r.drafts.find((x) => x.authorId === u.id);
  if (!d) throw new Error("Save your draft paper first.");
  const c = draftCheck(r, J<string[]>(d.itemIdsJson, []));
  if (!c.ok) throw new Error(`The draft doesn't meet the exam blueprint yet: ${c.fails.join(" ")}`);
  await db.examDraft.update({ where: { id: d.id }, data: { status: "SUBMITTED", submittedAt: new Date(), checkJson: JSON.stringify(c), updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: u.id, action: "EXAM_DRAFT_SUBMITTED", entityType: "ExamDraft", entityId: d.id, metadata: { examType, team: t.key, questions: J<string[]>(d.itemIdsJson, []).length } });
  await notifyUsers(t.teachers.map((x) => x.id), { kind: "REQUEST", title: `${t.code} ${examType}: a draft paper to rate`, body: `${u.name || "A teacher"} submitted a draft. Rate its questions 1–5 stars.`, href: hrefOf(t.key, examType, "review"), exceptId: u.id }).catch(() => null);
}
export const hrefOf = (key: string, examType: string, tab?: string) => `/exam-board?team=${encodeURIComponent(key)}&exam=${examType}${tab ? `&tab=${tab}` : ""}`;

/** 1–5 stars on a proposed question (not one's own); 1–2 need a reason. */
export async function rate(u: U, chairmanId: string, t: Team, examType: string, itemId: string, stars: number, comment: string) {
  needTeacher(t, u);
  const r = await round(chairmanId, t, examType);
  needOpen(r);
  if (!r.proposed.includes(itemId)) throw new Error("Only questions in a submitted draft are rated.");
  if (r.byId.get(itemId)!.authorId === u.id) throw new Error("You can't rate your own question.");
  const e = ratingError(stars, comment);
  if (e) throw new Error(e);
  await db.qbRating.upsert({ where: { teamKey_examType_itemId_raterId: { teamKey: t.key, examType, itemId, raterId: u.id } }, create: { id: randomUUID(), chairmanId, teamKey: t.key, examType, itemId, raterId: u.id, stars, comment: comment.trim().slice(0, 1000) || null }, update: { stars, comment: comment.trim().slice(0, 1000) || null, updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: u.id, action: "QB_QUESTION_RATED", entityType: "QuestionBankItem", entityId: itemId, metadata: { examType, team: t.key, stars } });
}

// ---------------- the Course Lead
async function saveFinal(chairmanId: string, t: Team, examType: string, patch: Record<string, unknown>) {
  await db.examFinal.upsert({ where: { chairmanId_teamKey_examType: { chairmanId, teamKey: t.key, examType } }, create: { id: randomUUID(), chairmanId, teamKey: t.key, examType, ...patch }, update: { ...patch, updatedAt: new Date() } });
}
export async function leadAction(u: U, chairmanId: string, t: Team, examType: string, b: Record<string, any>) {
  needLead(t, u);
  const r = await round(chairmanId, t, examType);
  if (b.op !== "reopen") needOpen(r);
  const note = String(b.note || "").trim().slice(0, 1000);
  const decisions = { ...r.decisions }, removed = J<string[]>(r.final?.removedJson, []), extra = J<{ key: string; itemId: string }[]>(r.final?.extraJson, []), edits = { ...r.edits };
  const audit = (action: string, meta: Record<string, string | number | boolean | null>) => writeAuditLog({ actorUserId: u.id, action, entityType: "ExamFinal", entityId: `${t.key}:${examType}`, metadata: { examType, team: t.key, ...meta } });
  switch (b.op) {
    case "pick": {
      const p = r.picks.find((x) => x.slot.key === b.slot);
      const itemId = String(b.itemId || "");
      if (!p || !r.byId.has(itemId)) throw new Error("Choose a slot and a question.");
      const kind: Decision["kind"] = p.status === "TIE" && p.tied.includes(itemId) ? "TIE" : p.status === "AUTO" && p.itemId === itemId ? "PICK" : p.status === "UNRATED" || p.status === "EMPTY" ? "PICK" : "OVERRIDE";
      if (kind === "OVERRIDE" && note.length < 5) throw new Error("Say why you're overriding the highest-rated question.");
      decisions[p.slot.key] = { itemId, by: u.id, at: new Date().toISOString(), kind, note: note || undefined };
      await saveFinal(chairmanId, t, examType, { decisionsJson: JSON.stringify(decisions) });
      await audit(kind === "TIE" ? "EXAM_TIE_BROKEN" : kind === "OVERRIDE" ? "EXAM_LEAD_OVERRIDE" : "EXAM_LEAD_PICK", { slot: p.slot.key, itemId, tied: p.tied.join(","), note });
      return;
    }
    case "unpick": { delete decisions[String(b.slot)]; await saveFinal(chairmanId, t, examType, { decisionsJson: JSON.stringify(decisions) }); await audit("EXAM_LEAD_UNPICK", { slot: String(b.slot) }); return; }
    case "remove": {
      const key = String(b.slot);
      if (key.startsWith("x:")) { const i = extra.findIndex((x) => x.key === key); if (i >= 0) extra.splice(i, 1); } else removed.push(key);
      delete decisions[key];
      await saveFinal(chairmanId, t, examType, { removedJson: JSON.stringify(removed), extraJson: JSON.stringify(extra), decisionsJson: JSON.stringify(decisions) });
      await audit("EXAM_LEAD_REMOVED", { slot: key, note });
      return;
    }
    case "add": {
      const itemId = String(b.itemId || "");
      const q = r.byId.get(itemId);
      if (!q) throw new Error("Choose a question from the bank.");
      if (!q.complete) throw new Error("That question lacks its topic, CLO, difficulty or Bloom level.");
      if (r.paper.some((x) => x.id === itemId)) throw new Error("That question is already in the paper.");
      extra.push({ key: `x:${randomUUID().slice(0, 8)}`, itemId });
      await saveFinal(chairmanId, t, examType, { extraJson: JSON.stringify(extra) });
      await audit("EXAM_LEAD_ADDED", { itemId, note });
      return;
    }
    case "edit": {
      const itemId = String(b.itemId || "");
      if (!r.paper.some((x) => x.id === itemId)) throw new Error("Only a question in the paper can be adjusted.");
      const text = String(b.text || "").trim().slice(0, 8000), marks = Number(b.marks);
      if (text.length < 5) throw new Error("Write the question.");
      if (!Number.isFinite(marks) || marks <= 0 || marks > 100) throw new Error("Give the marks.");
      const before = r.paper.find((x) => x.id === itemId)!;
      edits[itemId] = { text, marks };
      await saveFinal(chairmanId, t, examType, { editsJson: JSON.stringify(edits) });
      await audit("EXAM_LEAD_EDITED", { itemId, before: before.text.slice(0, 400), after: text.slice(0, 400), marksBefore: before.marks, marks });
      return;
    }
    case "reopen": {
      if (!r.published) throw new Error("The paper isn't published.");
      if (note.length < 5) throw new Error("Say why the published paper is reopened.");
      await saveFinal(chairmanId, t, examType, { status: "OPEN" });
      await audit("EXAM_REOPENED", { note });
      return;
    }
    case "publish": return publish(u, chairmanId, t, examType, r);
  }
  throw new Error("Unknown action.");
}

/** Publish: the paper is locked, every section's question plan for this exam becomes the official paper (via the
 *  existing team-paper sync), the question texts go to each section's paper vetting draft, and the team is told. */
async function publish(u: U, chairmanId: string, t: Team, examType: string, r: Round) {
  const open = r.picks.filter((p) => p.status === "TIE" || p.status === "UNRATED" || p.status === "EMPTY");
  if (open.length) throw new Error(`Decide every slot first: ${open.map((p) => `${p.slot.key} (${p.status === "TIE" ? "tie" : p.status === "UNRATED" ? "not rated" : "no question"})`).join(", ")}.`);
  if (!r.check.ok) throw new Error(`The paper doesn't meet the exam blueprint: ${r.check.fails.join(" ")}`);
  const lr = leadRow(t);
  if (!lr) throw new Error("The Course Lead must teach one of the team's sections to publish its paper.");
  const { ensureInstructorCopy } = await import("./instructorCopy");
  await ensureInstructorCopy(lr.courseId);
  const [lectures, clos] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId: lr.courseId, source: "INSTRUCTOR" }, select: { id: true, lectureNumber: true } }),
    prisma.cLO.findMany({ where: { courseId: lr.courseId, source: "INSTRUCTOR" }, select: { id: true, code: true } }),
  ]);
  const lid = new Map(lectures.map((l) => [l.lectureNumber, l.id])), cid = new Map(clos.map((c) => [c.code, c.id]));
  await prisma.paperDistributionItem.deleteMany({ where: { courseId: lr.courseId, source: "INSTRUCTOR", examType } });
  await prisma.paperDistributionItem.createMany({ data: r.paper.map((q, i) => ({ courseId: lr.courseId, source: "INSTRUCTOR", examType, questionNo: i + 1, orderIndex: i, lectureRowId: q.lectureNumber !== null ? lid.get(q.lectureNumber) || null : null, topicText: q.topic || "—", cloId: cid.get(q.cloCodes[0]) || null, cognitiveLevel: q.bloom, marks: q.marks })) });
  const existing = await prisma.paperSubmission.findUnique({ where: { chairmanId_teamKey_examType: { chairmanId, teamKey: t.key, examType } } });
  const sub = { leadCourseId: lr.courseId, leadId: u.id, status: "APPROVED", submittedAt: new Date(), approvedAt: new Date() };
  if (existing) { await prisma.paperApproval.deleteMany({ where: { submissionId: existing.id } }); await prisma.paperSubmission.update({ where: { id: existing.id }, data: { ...sub, version: existing.version + 1 } }); }
  else await prisma.paperSubmission.create({ data: { chairmanId, teamKey: t.key, examType, ...sub } });
  await syncApprovedPaper(t, lr.courseId, examType);
  // Each section's paper vetting draft gets the questions as written (a submitted or approved vetting is left alone).
  const full = (q: PaperQ) => { const b = r.byId.get(q.id)!; return [q.text, b.codeSnippet ? `\n${b.codeSnippet}` : "", b.options.length ? `\n${b.options.map((o, i) => `(${String.fromCharCode(97 + i)}) ${o}`).join("\n")}` : ""].join(""); };
  for (const row of t.rows) {
    const items = await prisma.paperDistributionItem.findMany({ where: { courseId: row.courseId, source: "INSTRUCTOR", examType }, orderBy: { orderIndex: "asc" }, select: { id: true } });
    const qj = JSON.stringify(Object.fromEntries(items.map((it, i) => [it.id, r.paper[i] ? full(r.paper[i]) : ""])));
    const v = await db.paperVetting.findUnique({ where: { courseId_examType: { courseId: row.courseId, examType } } }).catch(() => null);
    if (!v) await db.paperVetting.create({ data: { courseId: row.courseId, examType, status: "DRAFT", questionsJson: qj } }).catch(() => null);
    else if (["DRAFT", "RETURNED"].includes(v.status)) await db.paperVetting.update({ where: { id: v.id }, data: { questionsJson: qj } }).catch(() => null);
  }
  const snapshot = { paper: r.paper.map((q) => { const b = r.byId.get(q.id)!; return { ...q, kind: b.kind, rubric: b.rubric, options: b.options, correctIndex: b.correctIndex, codeSnippet: b.codeSnippet, hasImage: b.hasImage, avg: r.candidates.find((c) => c.id === q.id)?.avg ?? null }; }), mapping: mappingTable(r.paper), check: r.check, course: { code: t.code, title: t.title, term: t.term }, examType, decisions: r.decisions };
  await saveFinal(chairmanId, t, examType, { status: "PUBLISHED", paperJson: JSON.stringify(snapshot), leadCourseId: lr.courseId, publishedAt: new Date(), publishedById: u.id });
  await db.questionBankItem.updateMany({ where: { id: { in: r.paper.map((q) => q.id) } }, data: { usedCount: { increment: 1 } } }).catch(() => null);
  await writeAuditLog({ actorUserId: u.id, action: "EXAM_PUBLISHED", entityType: "ExamFinal", entityId: `${t.key}:${examType}`, metadata: { examType, team: t.key, questions: r.paper.length, total: r.check.total, sections: t.rows.length } });
  await notifyUsers(t.teachers.map((x) => x.id), { kind: "REQUEST", title: `${t.code} ${examType} paper published`, body: `${u.name || "The Course Lead"} published the official ${examType.toLowerCase()} paper. Every section has it in its question plan.`, href: hrefOf(t.key, examType, "paper"), exceptId: u.id }).catch(() => null);
}

export { examOf };
