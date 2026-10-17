import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

export const rfdb = prisma as unknown as Record<string, any>;
export const FLAG_ROLE: Record<string, string> = { ADVISOR: "Advisor", TEACHER: "Course teacher", NEXT_TEACHER: "Next course's teacher", OMC: "OMC", PROGRAM: "Program Lead / Chairman" };
type Who = { id: string; role: string; managedById: string | null };

/** In what capacity this person may flag this student on this course, or null. The advisor comes first. */
export async function flagCapacity(user: Who, studentId: string, courseId: string): Promise<string | null> {
  const [st, course] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, batch: { select: { advisorId: true, coordinatorId: true, coordinator: { select: { managedById: true } } } } } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, coordinatorId: true } }),
  ]);
  if (!st || !course) return null;
  const cid = await chairmanIdFor(user).catch(() => "");
  if (st.batch.coordinator.managedById !== (user.role === "CHAIRMAN" ? user.id : cid)) return null;
  if (st.batch.advisorId === user.id) return "ADVISOR";
  if (course.instructorId === user.id) return "TEACHER";
  if (user.role === "OMC") return "OMC";
  if (["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role)) return "PROGRAM";
  // Teaching the student now in another course (the course that builds on this one).
  const now = await prisma.studentEnrollment.count({ where: { studentId, status: "ACTIVE", course: { instructorId: user.id, isOffered: true, id: { not: courseId } } } });
  return now ? "NEXT_TEACHER" : null;
}

/** Courses this person can flag students on: taught by them, taken earlier by students they teach now, taken by their advisees, or (OMC / leads) any. */
export async function flaggableCourses(user: Who) {
  const cid = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user).catch(() => "");
  const advisees = await prisma.student.findMany({ where: { batch: { advisorId: user.id } }, select: { id: true } });
  const current = await prisma.studentEnrollment.findMany({ where: { status: "ACTIVE", course: { instructorId: user.id, isOffered: true } }, select: { studentId: true, courseId: true } });
  const studentIds = Array.from(new Set([...advisees.map((s) => s.id), ...current.map((c) => c.studentId)]));
  const wide = ["OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role);
  const courses = await prisma.course.findMany({
    where: wide ? { coordinator: { managedById: cid }, studentMarks: { some: {} }, ...(user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : {}) }
      : { OR: [{ instructorId: user.id }, { studentEnrollments: { some: { studentId: { in: studentIds } } } }], studentMarks: { some: {} } },
    select: { id: true, code: true, title: true, batch: { select: { batchName: true } } }, orderBy: { code: "asc" }, take: 300,
  });
  const currentIds = new Set(current.map((c) => c.courseId));
  void currentIds;
  return courses.map((c) => ({ id: c.id, label: `${c.code} ${c.title} — ${c.batch?.batchName || ""}` }));
}
