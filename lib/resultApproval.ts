import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { approverFor } from "./approvers";

// Result approval: Instructor submits the course result -> Chairman (Head of Department of the course's department)
// or the Institute Head approves it, or returns it with a note. Once SUBMITTED or APPROVED, marks and grade cutoffs are
// locked; after approval a single student's grade can only change through an approved GradeChangeRequest.
// (The two tables are new, so they are reached through an untyped handle until the Prisma client is regenerated.)

export const db = prisma as unknown as Record<string, any>;

export type ResultStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";
export type CourseResultRow = {
  id: string; courseId: string; status: ResultStatus; termName: string | null; termYear: number | null;
  submittedById: string | null; submittedAt: Date | null; decidedById: string | null; decidedAt: Date | null;
  note: string | null; summaryJson: string | null;
};
export type GradeChangeRow = {
  id: string; courseId: string; studentId: string; oldGrade: string; newGrade: string; totalPct: number | null; reason: string;
  requestedById: string; status: "PENDING" | "APPROVED" | "REJECTED"; decidedById: string | null; decidedAt: Date | null; decisionNote: string | null; createdAt: Date;
};

export const APPROVER_ROLES = ["CHAIRMAN", "HEAD_OF_DEPARTMENT"];
export const RESULT_VIEW_ROLES = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"];

export async function getCourseResult(courseId: string): Promise<CourseResultRow | null> {
  try { return (await db.courseResult.findUnique({ where: { courseId } })) as CourseResultRow | null; }
  catch { return null; } // table not created yet: behave as "not submitted"
}

/** A message when marks / cutoffs of this course can't be changed any more, else null. */
export async function resultLockMessage(courseId: string): Promise<string | null> {
  const r = await getCourseResult(courseId);
  if (r?.status === "APPROVED") return "This course's result has been approved and is locked. To change a student's grade, send a grade change request from the Marks page.";
  if (r?.status === "SUBMITTED") return "This course's result is waiting for approval and is locked. Withdraw the submission on the Marks page to make changes.";
  return null;
}

/** Approved grade changes, latest per student, to override the computed grade. */
export async function approvedGradeOverrides(courseId: string): Promise<Map<string, { grade: string; requestId: string }>> {
  const out = new Map<string, { grade: string; requestId: string }>();
  try {
    const rows = (await db.gradeChangeRequest.findMany({ where: { courseId, status: "APPROVED" }, orderBy: { decidedAt: "asc" } })) as GradeChangeRow[];
    for (const r of rows) out.set(r.studentId, { grade: r.newGrade, requestId: r.id });
  } catch { /* table not created yet */ }
  return out;
}

/** Who decides this course's result: the Chairman (Head of Department) of its department, and the Institute Head. */
export async function approversFor(courseId: string): Promise<{ chairmanId: string | null; ids: string[] }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { managedById: true, departmentId: true } } } });
  const chairmanId = course?.coordinator?.managedById || null;
  if (!chairmanId) return { chairmanId: null, ids: [] };
  // The department's Chairman/HoD, or whoever acts for or covers them (lib/approvers.ts); else the Institute Head.
  const ids = (await approverFor(chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: course?.coordinator?.departmentId })).ids;
  return { chairmanId, ids: ids.length ? ids : [chairmanId] };
}

/** May this user decide (approve / return) this course's result and its grade changes? */
export async function canDecide(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, coordinator: { select: { managedById: true, departmentId: true } } } });
  if (!course) return false;
  if (course.instructorId === user.id) return false; // nobody approves their own result
  // Someone acting for the Chairman/HoD, or covering the position while it is vacant or switched off.
  if ((await approversFor(courseId)).ids.includes(user.id)) return true;
  // The Controller of Examinations also decides grade changes (after publication) for the institute's courses.
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true } });
  if (me?.extraRoles?.includes("EXAM_CONTROLLER")) { const { chairmanIdFor } = await import("./reportScope"); if ((await chairmanIdFor(user as never).catch(() => null)) === course.coordinator?.managedById) return true; }
  if (!APPROVER_ROLES.includes(user.role)) return false;
  if (user.role === "CHAIRMAN") return course.coordinator?.managedById === user.id;
  return course.coordinator?.managedById === user.managedById && !!user.departmentId && course.coordinator?.departmentId === user.departmentId;
}

/** A notification (the bell, and email when configured) so the other side knows something needs them. */
export async function notify(chairmanId: string | null, fromId: string, toIds: string[], subject: string, body: string, href: string) {
  if (!toIds.length) return;
  void chairmanId;
  const { notifyUsers } = await import("./notifications");
  await notifyUsers(toIds, { kind: /grade/i.test(subject) ? "GRADE_CHANGE" : "RESULT", title: subject, body, href, exceptId: fromId });
}

export async function logResult(actorUserId: string, action: string, courseId: string, metadata: Record<string, string | number | null> = {}) {
  await writeAuditLog({ actorUserId, action, entityType: "Course", entityId: courseId, metadata });
}

/** The grade picture of a course right now: counts per grade, mean, pass rate — stored with each submit / approval. */
export async function resultSummary(courseId: string) {
  const { computeResultMate } = await import("./resultMate");
  const r = await computeResultMate(courseId);
  const marked = await prisma.studentMark.groupBy({ by: ["studentId"], where: { courseId } });
  const dist: Record<string, number> = {};
  for (const row of r.rows) dist[row.grade] = (dist[row.grade] || 0) + 1;
  const failed = r.rows.filter((x) => x.grade === "F").length;
  return {
    students: r.rows.length, withMarks: marked.length, mean: r.stats.mean, sd: r.stats.sd, cutoffsSet: r.cutoffsAreSet,
    distribution: dist, failed, passRate: r.rows.length ? Math.round((100 * (r.rows.length - failed)) / r.rows.length) : 0,
    grades: r.rows.map((x) => ({ studentId: x.studentId, rollNumber: x.rollNumber, name: x.name, totalPct: x.totalPct, grade: x.grade })),
  };
}
export type ResultSummary = Awaited<ReturnType<typeof resultSummary>>;
