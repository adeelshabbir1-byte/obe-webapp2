import { prisma } from "./db";

/** When a course becomes offered, every student in its home batch is
 * automatically enrolled (non-repeat) — the Instructor can still add or drop
 * individual students afterward. Safe to call repeatedly; only fills gaps. */
export async function autoEnrollBatchStudents(courseId: string, batchId: string | null) {
  if (!batchId) return 0;
  const students = await prisma.student.findMany({ where: { batchId } });
  if (students.length === 0) return 0;

  const existing = await prisma.studentEnrollment.findMany({ where: { courseId }, select: { studentId: true } });
  const existingIds = new Set(existing.map((e) => e.studentId));
  const toEnroll = students.filter((s) => !existingIds.has(s.id));
  if (toEnroll.length === 0) return 0;

  await prisma.studentEnrollment.createMany({
    data: toEnroll.map((s) => ({ studentId: s.id, courseId, isRepeat: false })),
    skipDuplicates: true,
  });
  return toEnroll.length;
}
