import { prisma } from "./db";
import { computeCgpa } from "./academicStanding";

/** When a course becomes offered, every student in its home batch is
 * automatically enrolled (non-repeat) — the Instructor can still add or drop
 * individual students afterward. Safe to call repeatedly; only fills gaps.
 *
 * A student whose CGPA is below 2.0 is the one exception: even this
 * default registration is gated behind Advisor approval for them,
 * rather than being applied automatically like everyone else. This is
 * a narrower, specific threshold than the broader Warning/Probation
 * gate (CGPA < 2.5) that governs a student's own later add/drop
 * requests — that gate stays as-is and is untouched by this. A
 * student with no completed courses yet (null CGPA) has nothing to
 * flag them on, so they're enrolled normally. */
export async function autoEnrollBatchStudents(courseId: string, batchId: string | null) {
  if (!batchId) return 0;
  const students = await prisma.student.findMany({ where: { batchId } });
  if (students.length === 0) return 0;

  const existing = await prisma.studentEnrollment.findMany({ where: { courseId }, select: { studentId: true } });
  const existingIds = new Set(existing.map((e) => e.studentId));
  const toEnroll = students.filter((s) => !existingIds.has(s.id));
  if (toEnroll.length === 0) return 0;

  const enrollNow: string[] = [];
  for (const student of toEnroll) {
    const cgpa = await computeCgpa(student.id);
    if (cgpa !== null && cgpa < 2.0) {
      const alreadyPending = await prisma.registrationApprovalRequest.findFirst({
        where: { studentId: student.id, courseId, actionType: "REGISTER", status: "PENDING" },
      });
      if (!alreadyPending) {
        await prisma.registrationApprovalRequest.create({
          data: { studentId: student.id, courseId, actionType: "REGISTER", reasonCode: "ACADEMIC_STANDING" },
        });
      }
      continue;
    }
    enrollNow.push(student.id);
  }

  if (enrollNow.length === 0) return 0;

  await prisma.studentEnrollment.createMany({
    data: enrollNow.map((studentId) => ({ studentId, courseId, isRepeat: false })),
    skipDuplicates: true,
  });
  return enrollNow.length;
}
