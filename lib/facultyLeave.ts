import { prisma } from "./db";
import { courseTermIndex, termLabel } from "./courseTerm";
import { termIndex } from "./termLogic";
import { instituteTerm } from "./assignerHat";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";

// Faculty leave: a teacher on semester / study leave or sabbatical, or one who has left the institute. Everything they
// did stays on record (lectures, marks, plans, appraisals); they simply can't be given courses in the terms the leave
// covers, and courses already given to them for those terms can be taken back in one step, with a handover record.

export const ldb = prisma as unknown as Record<string, any>;
export type LeaveRow = { id: string; userId: string; chairmanId: string; kind: string; fromTerm: number; toTerm: number | null; allowDesign: boolean; note: string | null; createdById: string; createdAt: Date; endedAt: Date | null };
export const LEAVE_KINDS: Record<string, string> = { SEMESTER_LEAVE: "Semester leave", STUDY_LEAVE: "Study leave (PhD / higher studies)", SABBATICAL: "Sabbatical", MEDICAL: "Long medical leave", LEFT: "Left the institute" };
export const LEAVE_MANAGERS = ["CHAIRMAN", "HEAD_OF_DEPARTMENT"];

export function leaveText(l: Pick<LeaveRow, "kind" | "fromTerm" | "toTerm">) {
  return l.kind === "LEFT" ? `${LEAVE_KINDS.LEFT} (from ${termLabel(l.fromTerm)})` : `${LEAVE_KINDS[l.kind] || l.kind}, ${termLabel(l.fromTerm)}${l.toTerm !== null && l.toTerm !== l.fromTerm ? ` – ${termLabel(l.toTerm)}` : ""}${l.toTerm === null ? " onwards" : ""}`;
}
const covers = (l: LeaveRow, t: number) => !l.endedAt && t >= l.fromTerm && (l.toTerm === null || t <= l.toTerm);

/** The institute's current term index (from the Program Leads' "current term" setting). */
export async function currentTermOf(chairmanId: string): Promise<number | null> {
  const t = await instituteTerm(chairmanId);
  return t ? termIndex(t.termName, t.year) : null;
}

export async function leavesOf(userIds: string[]): Promise<LeaveRow[]> {
  if (!userIds.length) return [];
  try { return (await ldb.facultyLeave.findMany({ where: { userId: { in: userIds }, endedAt: null } })) as LeaveRow[]; } catch { return []; }
}

/** Why this person can't take this course (as Instructor or Subject Expert), or null when they can. */
export async function leaveBlock(userId: string | null, courseId: string, as: "INSTRUCTOR" | "SUBJECT_EXPERT"): Promise<string | null> {
  if (!userId) return null;
  const leaves = await leavesOf([userId]);
  if (!leaves.length) return null;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { semesterNumber: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { managedById: true } }, batch: { select: { startTerm: true, startYear: true } } } });
  if (!c) return null;
  const t = courseTermIndex(c) ?? (await currentTermOf(c.coordinator?.managedById || ""));
  if (t === null) return null;
  const hit = leaves.find((l) => covers(l, t) && !(as === "SUBJECT_EXPERT" && l.allowDesign && l.kind !== "LEFT"));
  if (!hit) return null;
  const who = (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name || "This teacher";
  return `${who} is away: ${leaveText(hit)}. They can't be given a course for ${termLabel(t)}.`;
}

/** Ids of people on leave in a given term — to leave them out of pickers and exam duties. */
export async function awayInTerm(userIds: string[], term: number | null) {
  if (term === null) return new Set<string>();
  return new Set((await leavesOf(userIds)).filter((l) => covers(l, term)).map((l) => l.userId));
}

/** Courses the person holds in the leave's terms (as Instructor or Subject Expert). */
export async function affectedCourses(l: LeaveRow) {
  const courses = await prisma.course.findMany({
    where: { OR: [{ instructorId: l.userId }, { subjectExpertId: l.userId }] },
    select: { id: true, code: true, title: true, instructorId: true, subjectExpertId: true, isOffered: true, templateStatus: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, coordinatorId: true, batch: { select: { startTerm: true, startYear: true, degreeProgram: true, batchName: true } } },
  });
  const now = await currentTermOf(l.chairmanId);
  return courses.map((c) => ({ c, term: courseTermIndex(c) ?? now })).filter((x) => x.term !== null && covers(l, x.term)).map(({ c, term }) => ({
    id: c.id, code: c.code, title: c.title, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", term: termLabel(term!), coordinatorId: c.coordinatorId,
    asInstructor: c.instructorId === l.userId, asExpert: c.subjectExpertId === l.userId && !(l.allowDesign && l.kind !== "LEFT"), planStatus: c.templateStatus,
  })).filter((x) => x.asInstructor || x.asExpert);
}

/** Take the courses back from the person on leave. Lectures already taught stay with the course, and a handover record says who taught them. */
export async function revokeCourses(l: LeaveRow, courseIds: string[], actor: { id: string; name: string }) {
  const list = (await affectedCourses(l)).filter((x) => courseIds.includes(x.id));
  const { syncSubjectExpertToLinkedCourses } = await import("./contentSync");
  const reason = `${leaveText(l)}`;
  const leads = new Map<string, string[]>();
  for (const x of list) {
    if (x.asInstructor) {
      const logged = await prisma.lectureRow.findMany({ where: { courseId: x.id, source: "INSTRUCTOR", actualDate: { not: null } }, select: { lectureNumber: true } });
      await prisma.course.update({ where: { id: x.id }, data: { instructorId: null, instructorResponse: "NONE", instructorResponseNote: null } as never });
      try { await ldb.courseHandover.create({ data: { courseId: x.id, fromUserId: l.userId, lecturesDelivered: logged.length, lastLectureNumber: logged.length ? Math.max(...logged.map((r) => r.lectureNumber)) : null, reason, createdById: actor.id } }); } catch { /* table missing */ }
      await writeAuditLog({ actorUserId: actor.id, action: "INSTRUCTOR_REMOVED_FOR_LEAVE", entityType: "Course", entityId: x.id, metadata: { userId: l.userId, lecturesDelivered: logged.length, reason } });
    }
    if (x.asExpert) {
      await prisma.course.update({ where: { id: x.id }, data: { subjectExpertId: null, seResponse: "NONE", seResponseNote: null } });
      await syncSubjectExpertToLinkedCourses(x.id, null);
      await writeAuditLog({ actorUserId: actor.id, action: "SUBJECT_EXPERT_REMOVED", entityType: "Course", entityId: x.id, metadata: { previousSubjectExpertId: l.userId, newSubjectExpertId: "none", courseCode: x.code, courseTitle: x.title, templateStatus: x.planStatus, reason } });
    }
    leads.set(x.coordinatorId, [...(leads.get(x.coordinatorId) || []), `${x.code}${x.asInstructor && x.asExpert ? " (teacher and expert)" : x.asInstructor ? " (teacher)" : " (expert)"}`]);
  }
  const who = (await prisma.user.findUnique({ where: { id: l.userId }, select: { name: true } }))?.name || "A teacher";
  for (const [lead, codes] of Array.from(leads.entries())) {
    await notifyUsers([lead], { kind: "ASSIGNMENT", title: `${who} is away — ${codes.length} course(s) need someone`, body: `${actor.name} took back ${codes.join(", ")} from ${who} (${reason}). Please assign someone else.`, href: "/coordinator/courses" });
  }
  await notifyUsers([l.userId], { kind: "ASSIGNMENT", title: "Your courses were reassigned for your leave", body: `${actor.name} took back ${list.map((x) => x.code).join(", ")} for ${reason}. Your records stay as they are.`, href: "/dashboard" });
  return list.length;
}
