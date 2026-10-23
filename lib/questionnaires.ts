import { randomUUID } from "crypto";
import { prisma } from "./db";
import { EVAL, MIN_RESPONSES } from "./evaluations";
import { QEC_INCHARGE, dutyHolders } from "./duties";

// The institute's student feedback questionnaires, set by the QEC In-charge (until one is named: the Institute Head or a
// Dean). Each question has a fixed key across rewording (so terms stay comparable), a group, a weight in the total and
// an FDP topic for when it scores low. Until the institute edits anything, the HEC questions in lib/evaluations.ts are
// used as version 1 — so every answer given so far keeps working.

const qdb = prisma as unknown as Record<string, any>;
export const QUESTIONNAIRE_HINT = "Questionnaires need prisma/migration_feedback_questionnaires.sql — run it in Supabase.";
export type Kind = "COURSE" | "TEACHER";
export type Question = { key: string; kind: Kind; text: string; group: string; weight: number; order: number; version: number; retired: boolean; fdpTopic: string | null };

const GROUP: Record<string, string> = {
  objectives: "Content", content: "Content", workload: "Content", assessment: "Assessment", feedback: "Assessment", resources: "Resources", labs: "Resources", skills: "Learning", overall: "Overall",
  prepared: "Preparation", covered: "Preparation", clear: "Delivery", engaged: "Delivery", fair: "Assessment", punctual: "Behaviour", available: "Behaviour", respect: "Behaviour",
};
const FDP_TOPIC: Record<string, string> = {
  "TEACHER:clear": "Teaching skills: explaining concepts clearly", "TEACHER:engaged": "Active learning and classroom engagement", "TEACHER:fair": "Fair assessment, rubrics and grading",
  "TEACHER:available": "Student mentoring and office hours", "TEACHER:prepared": "Lesson planning and preparation", "TEACHER:covered": "Course planning and pacing the outline",
  "TEACHER:punctual": "Professional conduct and time management", "TEACHER:respect": "Student-centred teaching",
  "COURSE:assessment": "Assessment design aligned to CLOs", "COURSE:feedback": "Giving useful feedback on student work", "COURSE:content": "Updating course content", "COURSE:workload": "Workload and credit-hour design",
};
/** Version 1: the HEC questions. */
export function defaultQuestions(kind: Kind): Question[] {
  return EVAL[kind].items.map(([key, text], i) => ({ key, kind, text, group: GROUP[key] || "General", weight: 1, order: i, version: 1, retired: false, fdpTopic: FDP_TOPIC[`${kind}:${key}`] || null }));
}

type Row = { key: string; kind: Kind; text: string; groupName: string; weight: number; orderIndex: number; version: number; retiredAt: Date | null; fdpTopic: string | null };
const toQ = (r: Row): Question => ({ key: r.key, kind: r.kind, text: r.text, group: r.groupName, weight: r.weight, order: r.orderIndex, version: r.version, retired: !!r.retiredAt, fdpTopic: r.fdpTopic });

/** Every question the institute has had for this kind, retired ones included (for reading old answers). */
export async function allQuestions(chairmanId: string | null | undefined, kind: Kind): Promise<Question[]> {
  if (!chairmanId) return defaultQuestions(kind);
  try {
    const rows = (await qdb.feedbackQuestion.findMany({ where: { chairmanId, kind }, orderBy: { orderIndex: "asc" } })) as Row[];
    return rows.length ? rows.map(toQ) : defaultQuestions(kind);
  } catch { return defaultQuestions(kind); }
}
/** The questions students answer now. */
export async function questionsFor(chairmanId: string | null | undefined, kind: Kind): Promise<Question[]> {
  return (await allQuestions(chairmanId, kind)).filter((q) => !q.retired);
}

async function seedIfEmpty(chairmanId: string, kind: Kind, by: string) {
  if (await qdb.feedbackQuestion.count({ where: { chairmanId, kind } })) return;
  for (const q of defaultQuestions(kind)) {
    const id = randomUUID();
    await qdb.feedbackQuestion.create({ data: { id, chairmanId, kind, key: q.key, groupName: q.group, weight: q.weight, orderIndex: q.order, text: q.text, version: 1, fdpTopic: q.fdpTopic, updatedById: by } });
    await qdb.feedbackQuestionVersion.create({ data: { id: randomUUID(), questionId: id, version: 1, text: q.text, byId: by } });
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "q";

/** Add, reword, regroup, reweight, reorder or retire a question. Rewording keeps the key and raises the version. */
export async function saveQuestion(chairmanId: string, kind: Kind, q: { key?: string; text: string; group: string; weight: number; order?: number; retired?: boolean; fdpTopic?: string | null }, by: string) {
  await seedIfEmpty(chairmanId, kind, by);
  const text = q.text.trim().slice(0, 300);
  if (!text) throw new Error("Write the question.");
  const weight = Math.max(0, Math.min(100, Number(q.weight) || 0));
  const group = (q.group || "General").trim().slice(0, 40) || "General";
  const existing = q.key ? ((await qdb.feedbackQuestion.findUnique({ where: { chairmanId_kind_key: { chairmanId, kind, key: q.key } } })) as (Row & { id: string }) | null) : null;
  if (existing) {
    const reworded = existing.text !== text;
    await qdb.feedbackQuestion.update({ where: { id: existing.id }, data: { text, groupName: group, weight, ...(q.order !== undefined ? { orderIndex: q.order } : {}), retiredAt: q.retired ? existing.retiredAt || new Date() : null, fdpTopic: q.fdpTopic?.trim() || null, version: reworded ? existing.version + 1 : existing.version, updatedById: by, updatedAt: new Date() } });
    if (reworded) await qdb.feedbackQuestionVersion.create({ data: { id: randomUUID(), questionId: existing.id, version: existing.version + 1, text, byId: by } });
    return existing.key;
  }
  const taken = new Set(((await qdb.feedbackQuestion.findMany({ where: { chairmanId, kind }, select: { key: true } })) as { key: string }[]).map((x) => x.key));
  let key = slug(text.split(" ").slice(0, 4).join(" "));
  for (let i = 2; taken.has(key); i++) key = `${slug(text.split(" ").slice(0, 4).join(" "))}_${i}`;
  const id = randomUUID();
  const order = q.order ?? (await qdb.feedbackQuestion.count({ where: { chairmanId, kind } }));
  await qdb.feedbackQuestion.create({ data: { id, chairmanId, kind, key, groupName: group, weight, orderIndex: order, text, version: 1, fdpTopic: q.fdpTopic?.trim() || null, updatedById: by } });
  await qdb.feedbackQuestionVersion.create({ data: { id: randomUUID(), questionId: id, version: 1, text, byId: by } });
  return key;
}

export async function reorder(chairmanId: string, kind: Kind, keys: string[], by: string) {
  await seedIfEmpty(chairmanId, kind, by);
  for (let i = 0; i < keys.length; i++) await qdb.feedbackQuestion.updateMany({ where: { chairmanId, kind, key: keys[i] }, data: { orderIndex: i } });
}

export async function versionsOf(chairmanId: string, kind: Kind) {
  try {
    const qs = (await qdb.feedbackQuestion.findMany({ where: { chairmanId, kind }, select: { id: true, key: true } })) as { id: string; key: string }[];
    const vs = (await qdb.feedbackQuestionVersion.findMany({ where: { questionId: { in: qs.map((q) => q.id).concat("none") } }, orderBy: { version: "asc" } })) as { questionId: string; version: number; text: string; createdAt: Date }[];
    const keyOf = new Map(qs.map((q) => [q.id, q.key]));
    const out = new Map<string, { version: number; text: string; at: string }[]>();
    for (const v of vs) { const k = keyOf.get(v.questionId)!; out.set(k, [...(out.get(k) || []), { version: v.version, text: v.text, at: v.createdAt.toISOString().slice(0, 10) }]); }
    return out;
  } catch { return new Map<string, { version: number; text: string; at: string }[]>(); }
}

// ---------------------------------------------------------------- window and minimum answers
export type Settings = { fromWeek: number | null; toWeek: number | null; minResponses: number };
export async function settingsFor(chairmanId: string | null | undefined): Promise<Settings> {
  const d = { fromWeek: null, toWeek: null, minResponses: MIN_RESPONSES };
  if (!chairmanId) return d;
  try { const r = await qdb.feedbackSettings.findUnique({ where: { chairmanId } }); return r ? { fromWeek: r.fromWeek ?? null, toWeek: r.toWeek ?? null, minResponses: r.minResponses ?? MIN_RESPONSES } : d; } catch { return d; }
}
export async function saveSettings(chairmanId: string, s: Settings, by: string) {
  const data = { fromWeek: s.fromWeek, toWeek: s.toWeek, minResponses: Math.max(1, Math.min(50, s.minResponses || MIN_RESPONSES)), updatedById: by, updatedAt: new Date() };
  await qdb.feedbackSettings.upsert({ where: { chairmanId }, create: { id: randomUUID(), chairmanId, ...data }, update: data });
}

/** Whether a course's feedback is open now: within the window's weeks of the course's semester (from the Program Lead's
 * semester start date). No window set, or no start date known → open. */
export async function windowOf(courseId: string, s: Settings, now = new Date()) {
  if (s.fromWeek === null && s.toWeek === null) return { open: true, week: null as number | null, opensOn: null as string | null, closesOn: null as string | null };
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinatorId: true, offeredTermName: true, offeredTermYear: true, batch: { select: { degreeProgram: true } } } });
  const sd = c?.offeredTermName && c.offeredTermYear ? await prisma.semesterDates.findFirst({ where: { coordinatorId: c.coordinatorId, termName: c.offeredTermName, termYear: c.offeredTermYear, ...(c.batch ? { degreeProgram: c.batch.degreeProgram } : {}) }, select: { semesterStartDate: true } }).catch(() => null) : null;
  const start = sd?.semesterStartDate;
  if (!start) return { open: true, week: null, opensOn: null, closesOn: null };
  const week = Math.floor((now.getTime() - start.getTime()) / (7 * 864e5)) + 1;
  const from = s.fromWeek ?? 1, to = s.toWeek ?? 99;
  const day = (w: number) => new Date(start.getTime() + (w - 1) * 7 * 864e5).toISOString().slice(0, 10);
  return { open: week >= from && week <= to, week, opensOn: day(from), closesOn: day(to + 1) };
}

// ---------------------------------------------------------------- who sets them
export async function qecIncharges(chairmanId: string) { return dutyHolders(chairmanId, QEC_INCHARGE).catch(() => []); }
/** The QEC In-charge; until one is named, the Institute Head or a Dean (the Institute Head always can). */
export async function canEditQuestionnaires(u: { id: string; role: string; extraRoles?: string[] | null }, chairmanId: string) {
  if (u.role === "CHAIRMAN") return true;
  if ((u.extraRoles || []).includes(QEC_INCHARGE)) return true;
  if (u.role === "DEAN") return (await qecIncharges(chairmanId)).length === 0;
  return false;
}
