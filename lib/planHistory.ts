import crypto from "crypto";
import { prisma } from "./db";

// A student's degree plan over time: a version is kept each time the plan is locked, unlocked or handed to a new
// advisor; every course move is recorded with who, when and why; the student and the advisor comment on it.
export const hdb = prisma as unknown as Record<string, any>;
export const REASONS = [["NOT_OFFERED", "Course not offered"], ["CLASH", "Timetable clash"], ["PROGRESS", "Student progress (failed / dropped / CGPA rule)"], ["REQUEST", "Student request"], ["TRANSFER", "Transfer / equivalence"], ["OTHER", "Other"]] as const;
export type PlanItem = { courseId: string; code: string; title: string; sem: number };
export type Version = { id: string; studentId: string; kind: string; byId: string; byName: string; reason: string | null; note: string | null; itemsJson: string; at: Date };
export type Move = { id: string; studentId: string; courseId: string; code: string; fromSem: number | null; toSem: number; byId: string; byName: string; reason: string | null; note: string | null; at: Date };
export type Comment = { id: string; studentId: string; byId: string; byName: string; byStudent: boolean; body: string; courseId: string | null; versionId: string | null; at: Date };

export async function currentPlan(studentId: string): Promise<PlanItem[]> {
  const es = await prisma.degreePlanEntry.findMany({ where: { studentId }, select: { courseId: true, plannedSemesterNumber: true, course: { select: { code: true, title: true } } } });
  return es.map((e) => ({ courseId: e.courseId, code: e.course.code, title: e.course.title, sem: e.plannedSemesterNumber })).sort((a, b) => a.sem - b.sem || a.code.localeCompare(b.code));
}
async function nameOf(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { name: true } }).catch(() => null);
  if (u) return u.name;
  return (await prisma.student.findUnique({ where: { id }, select: { name: true } }).catch(() => null))?.name || "";
}
export async function snapshot(studentId: string, byId: string, kind: "LOCK" | "UNLOCK" | "HANDOVER" | "SNAPSHOT", note: string | null = null, reason: string | null = null) {
  const items = await currentPlan(studentId);
  if (!items.length) return null;
  const id = crypto.randomUUID();
  await hdb.planVersion.create({ data: { id, studentId, kind, byId, byName: await nameOf(byId), reason, note, itemsJson: JSON.stringify(items) } }).catch(() => null);
  return id;
}
/** Call before / after moving a course in a plan: records the move with its reason. */
export async function recordMove(studentId: string, courseId: string, fromSem: number | null, toSem: number, byId: string, reason?: string | null, note?: string | null) {
  if (fromSem === toSem) return;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true } });
  await hdb.planMove.create({ data: { id: crypto.randomUUID(), studentId, courseId, code: c?.code || "", fromSem, toSem, byId, byName: await nameOf(byId), reason: REASONS.some(([k]) => k === reason) ? reason : null, note: note?.slice(0, 500) || null } }).catch(() => null);
}
export async function addComment(studentId: string, byId: string, byStudent: boolean, body: string, courseId?: string | null, versionId?: string | null) {
  const t = body.trim().slice(0, 2000);
  if (t.length < 2) throw new Error("Write a comment.");
  await hdb.planComment.create({ data: { id: crypto.randomUUID(), studentId, byId, byName: await nameOf(byId), byStudent, body: t, courseId: courseId || null, versionId: versionId || null } });
}
export async function historyOf(studentId: string) {
  const [versions, moves, comments, current] = await Promise.all([
    hdb.planVersion.findMany({ where: { studentId }, orderBy: { at: "asc" } }).catch(() => []) as Promise<Version[]>,
    hdb.planMove.findMany({ where: { studentId }, orderBy: { at: "desc" }, take: 200 }).catch(() => []) as Promise<Move[]>,
    hdb.planComment.findMany({ where: { studentId }, orderBy: { at: "desc" }, take: 200 }).catch(() => []) as Promise<Comment[]>,
    currentPlan(studentId),
  ]);
  return { versions, moves, comments, current };
}
/** Differences between two plans: moved (from → to), added, dropped. */
export function diff(a: PlanItem[], b: PlanItem[]) {
  const A = new Map(a.map((x) => [x.courseId, x])), B = new Map(b.map((x) => [x.courseId, x]));
  return {
    moved: b.filter((x) => A.has(x.courseId) && A.get(x.courseId)!.sem !== x.sem).map((x) => ({ ...x, from: A.get(x.courseId)!.sem })),
    added: b.filter((x) => !A.has(x.courseId)), dropped: a.filter((x) => !B.has(x.courseId)),
  };
}
