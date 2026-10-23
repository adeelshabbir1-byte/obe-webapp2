import { randomUUID } from "crypto";
import { prisma } from "./db";
import { labTasks, labFiles, fileStatus, syncIssues, theoryLectures, labsOfTheory } from "./labPlanCore";

// Lab under the theory instructor. When a theory course has a separate lab course, the theory instructor leads the lab:
// approves the Lab Engineer's manual for each session, and — when the lab's marks go into the theory result — approves
// the lab marks at the end, which brings them into the theory course as its "Lab" assessment (default 20% of the
// course) and locks them for the Lab Engineer. The lab then has no transcript line of its own; its credit hours are
// added to the theory course's line. Off: the lab stays a separate course with its own result (as before).

export const ltdb = prisma as unknown as Record<string, any>;
export const LAB_THEORY_HINT = "Lab marks in the theory result need prisma/migration_lab_theory.sql — run it in Supabase.";
export type LabSetting = { labCourseId: string; theoryCourseId: string | null; intoTheory: boolean; weightPct: number; instrumentId: string | null; oldWeightsJson: string | null; approvedAt: Date | null; approvedById: string | null; changeRequest: string | null; changeRequestedAt: Date | null };
export const DEFAULT_LAB_WEIGHT = 20;

export async function labSetting(labCourseId: string): Promise<LabSetting & { ready: boolean }> {
  try {
    const r = (await ltdb.labTheorySetting.findUnique({ where: { labCourseId } })) as LabSetting | null;
    return { ready: true, ...(r || { labCourseId, theoryCourseId: null, intoTheory: false, weightPct: DEFAULT_LAB_WEIGHT, instrumentId: null, oldWeightsJson: null, approvedAt: null, approvedById: null, changeRequest: null, changeRequestedAt: null }) };
  } catch { return { ready: false, labCourseId, theoryCourseId: null, intoTheory: false, weightPct: DEFAULT_LAB_WEIGHT, instrumentId: null, oldWeightsJson: null, approvedAt: null, approvedById: null, changeRequest: null, changeRequestedAt: null }; }
}
export async function saveLabSetting(labCourseId: string, data: Partial<LabSetting> & { updatedById: string }) {
  await ltdb.labTheorySetting.upsert({ where: { labCourseId }, create: { labCourseId, ...data, updatedAt: new Date() }, update: { ...data, updatedAt: new Date() } });
}
/** True when the lab's marks were approved into the theory result: the Lab Engineer can no longer change them. */
export async function labMarksLocked(labCourseId: string): Promise<string | null> {
  const s = await labSetting(labCourseId);
  return s.intoTheory && s.approvedAt ? "The theory instructor has approved these lab marks into the theory result, so they are locked. Use “Ask for a change” on the lab page." : null;
}

/**
 * Make sure the theory course has a "Lab" assessment carrying the lab's weight. When it has none, one is added and the
 * other assessments are scaled down so the total stays 100% (their old weights are kept so turning the setting off
 * puts them back). Returns the Lab assessment's id.
 */
export async function ensureLabItem(theoryId: string, labCode: string, weightPct: number, s: LabSetting): Promise<{ id: string; created: boolean; scaled: number }> {
  const existing = await prisma.assessmentInstrument.findFirst({ where: { courseId: theoryId, source: "INSTRUCTOR", type: "Lab", partOfId: null }, select: { id: true } });
  if (existing) return { id: existing.id, created: false, scaled: 0 };
  const w = Math.min(Math.max(weightPct, 1), 60);
  const others = await prisma.assessmentInstrument.findMany({ where: { courseId: theoryId, source: "INSTRUCTOR", marksPct: { gt: 0 } }, select: { id: true, marksPct: true } });
  const total = others.reduce((t, i) => t + i.marksPct, 0);
  let scaled = 0;
  if (total + w > 100.01 && total > 0) {
    const f = (100 - w) / total;
    for (const i of others) { await prisma.assessmentInstrument.update({ where: { id: i.id }, data: { marksPct: Math.round(i.marksPct * f * 100) / 100 } }); scaled++; }
  }
  const inst = await prisma.assessmentInstrument.create({ data: { courseId: theoryId, source: "INSTRUCTOR", type: "Lab", label: `Lab (${labCode})`, marksPct: w, maxScore: 100 } });
  if (!s.oldWeightsJson) await saveLabSetting(s.labCourseId, { oldWeightsJson: JSON.stringify(Object.fromEntries(others.map((i) => [i.id, i.marksPct]))), updatedById: "system" });
  return { id: inst.id, created: true, scaled };
}

/** Turning the setting off: take the Lab item OBEHUB added out of the theory course and put the old weights back. */
export async function removeLabItem(s: LabSetting) {
  if (!s.instrumentId || !s.theoryCourseId) return;
  const parts = await prisma.assessmentInstrument.findMany({ where: { partOfId: s.instrumentId }, select: { id: true } });
  const ids = [s.instrumentId, ...parts.map((p) => p.id)];
  await prisma.studentMark.deleteMany({ where: { instrumentId: { in: ids } } });
  await prisma.lectureRowInstrument.deleteMany({ where: { instrumentId: { in: ids } } }).catch(() => null);
  await prisma.assessmentInstrument.deleteMany({ where: { id: { in: parts.map((p) => p.id) } } });
  await prisma.assessmentInstrument.deleteMany({ where: { id: s.instrumentId } });
  let old: Record<string, number> = {}; try { old = JSON.parse(s.oldWeightsJson || "{}"); } catch { old = {}; }
  for (const [id, pct] of Object.entries(old)) await prisma.assessmentInstrument.updateMany({ where: { id, courseId: s.theoryCourseId }, data: { marksPct: pct } });
}

/** What the theory instructor sees about a lab: manuals approved / waiting, sessions held, marks, sync problems. */
export async function labStatus(labId: string, theoryId: string | null) {
  const [tasks, files, lectures, marks, enrolled, s] = await Promise.all([
    labTasks(labId), labFiles(labId), theoryLectures(theoryId),
    prisma.labMark.findMany({ where: { courseId: labId }, select: { labNumber: true, studentId: true } }),
    prisma.studentEnrollment.count({ where: { courseId: labId, status: { not: "WITHDRAWN" } } }),
    labSetting(labId),
  ]);
  const fs = fileStatus(tasks, files as never) as { labNumber: number; manual: { status: string } | null; solution: { status: string } | null }[];
  const manualsApproved = fs.filter((f) => f.manual?.status === "APPROVED").length;
  const manualsWaiting = fs.filter((f) => f.manual && f.manual.status !== "APPROVED").length;
  const manualsMissing = fs.filter((f) => !f.manual).length;
  const held = new Set(marks.map((m) => m.labNumber));
  const perSession = Array.from(held).map((n) => marks.filter((m) => m.labNumber === n).length);
  const attendance = enrolled && perSession.length ? Math.round((100 * perSession.reduce((a, b) => a + b, 0)) / (perSession.length * enrolled)) : null;
  const issues = syncIssues(tasks, lectures, !!theoryId);
  return { sessions: tasks.length, manualsApproved, manualsWaiting, manualsMissing, held: held.size, marks: marks.length, attendance, issues, setting: s };
}

/** Labs of a theory course with their settings (for the theory course's pages). */
export async function labsForTheory(theoryId: string) {
  const labs = await labsOfTheory(theoryId).catch(() => [] as { id: string; code: string }[]);
  return Promise.all(labs.map(async (l) => ({ ...l, setting: await labSetting(l.id) })));
}

/** Credit hours of labs whose marks went into this theory course (added to its transcript line). */
export async function mergedLabCredits(theoryId: string): Promise<number> {
  try {
    const rows = (await ltdb.labTheorySetting.findMany({ where: { theoryCourseId: theoryId, intoTheory: true } })) as { labCourseId: string }[];
    if (!rows.length) return 0;
    const cs = await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.labCourseId) } }, select: { creditHours: true } });
    return cs.reduce((t, c) => t + (c.creditHours || 0), 0);
  } catch { return 0; }
}
/** A lab whose marks go into its theory course: no transcript line of its own. */
export async function labGoesIntoTheory(labCourseId: string): Promise<boolean> { const s = await labSetting(labCourseId); return s.intoTheory; }

/** Mark a reminder as sent today for a lab session; false when one was already sent today. */
export async function claimReminder(labCourseId: string, labNumber: number, day: string) {
  try { await ltdb.labManualReminder.create({ data: { id: randomUUID(), labCourseId, labNumber, sentOn: day } }); return true; } catch { return false; }
}

/** Daily: a lab manual not yet approved three days before (or on the day of) its session → remind the Lab Engineer and
 *  the theory instructor, once a day per session. The session date comes from the lab plan's week and the term's start. */
export async function remindUnapprovedManuals(now = new Date()) {
  const { notifyUsers } = await import("./notifications");
  const { loadLabCourse } = await import("./labAccess");
  const plans = (await ltdb.labTaskPlan.findMany({ where: { week: { not: null } }, select: { labCourseId: true, labNumber: true, week: true }, take: 4000 }).catch(() => [])) as { labCourseId: string; labNumber: number; week: number }[];
  const labIds = Array.from(new Set(plans.map((p) => p.labCourseId))).slice(0, 300);
  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const id of labIds) {
    const loaded = await loadLabCourse(id).catch(() => null);
    if (!loaded || !loaded.lab.isOffered || !loaded.lab.offeredTermName || !loaded.lab.offeredTermYear) continue;
    const sd = await prisma.semesterDates.findFirst({ where: { coordinatorId: loaded.lab.coordinatorId, termName: loaded.lab.offeredTermName, termYear: loaded.lab.offeredTermYear, ...(loaded.lab.batch ? { degreeProgram: loaded.lab.batch.degreeProgram } : {}) }, select: { semesterStartDate: true } }).catch(() => null);
    if (!sd?.semesterStartDate) continue;
    const due = plans.filter((p) => p.labCourseId === id).filter((p) => { const at = sd.semesterStartDate!.getTime() + (p.week - 1) * 7 * 864e5; const d = (at - now.getTime()) / 864e5; return d >= -0.5 && d <= 3; });
    if (!due.length) continue;
    const st = fileStatus(await labTasks(id), (await labFiles(id)) as never) as { labNumber: number; manual: { status: string } | null }[];
    for (const p of due) {
      const f = st.find((x) => x.labNumber === p.labNumber);
      if (f?.manual?.status === "APPROVED") continue;
      if (!(await claimReminder(id, p.labNumber, day))) continue;
      const what = f?.manual ? "is waiting for the theory instructor's approval" : "has not been uploaded";
      await notifyUsers([loaded.lab.labEngineer?.id, loaded.lead?.id], { kind: "LAB_MANUAL", title: `${loaded.lab.code} lab ${p.labNumber} (week ${p.week}): the manual ${what}`, body: "It should be approved before the session.", href: `/lab-engineer/labs/${id}` });
      sent++;
    }
  }
  return sent;
}
