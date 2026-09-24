import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { getGradingScaleForBatch } from "../../../../lib/gradingScaleLookup";

const DEFAULT_MIN_CREDITS = 12;
const DEFAULT_MAX_CREDITS = 18;

export async function GET() {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId } });
  if (!batch) return NextResponse.json({ error: "batch not found" }, { status: 404 });

  const [transcriptRecords, gradingScale, coordinator, degreePlanEntries, enrolledCourseIds] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId: student.id }, orderBy: [{ termYear: "asc" }, { termName: "asc" }] }),
    getGradingScaleForBatch(batch.coordinatorId, batch),
    prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { minCreditsPerSemester: true, maxCreditsPerSemester: true } }),
    prisma.degreePlanEntry.findMany({ where: { studentId: student.id }, include: { course: true } }),
    prisma.studentEnrollment.findMany({ where: { studentId: student.id }, select: { courseId: true } }),
  ]);

  const takenCourseCodes = new Set(transcriptRecords.map((t) => t.courseCode));
  const enrolledIds = new Set(enrolledCourseIds.map((e) => e.courseId));
  const planByCourseId = new Map(degreePlanEntries.map((e) => [e.courseId, e]));

  // Every course in the student's own batch curriculum they haven't
  // already completed — batches get their full curriculum imported up
  // front, so future semesters' courses already exist as real rows,
  // just not "offered" yet until that term actually arrives.
  const allBatchCourses = await prisma.course.findMany({
    where: { batchId: batch.id, code: { notIn: Array.from(takenCourseCodes) } },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });

  const planned = allBatchCourses.map((c) => {
    const entry = planByCourseId.get(c.id);
    return {
      courseId: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
      nativeSemesterNumber: c.semesterNumber,
      plannedSemesterNumber: entry?.plannedSemesterNumber ?? c.semesterNumber,
      hypotheticalGrade: entry?.hypotheticalGrade ?? null,
      currentlyEnrolled: enrolledIds.has(c.id),
    };
  });

  return NextResponse.json({
    currentSemesterNumber: student.currentSemesterNumber,
    minCreditsPerSemester: coordinator?.minCreditsPerSemester ?? DEFAULT_MIN_CREDITS,
    maxCreditsPerSemester: coordinator?.maxCreditsPerSemester ?? DEFAULT_MAX_CREDITS,
    gradingScale: gradingScale.map((g) => ({ letter: g.letter, gpaValue: g.gpaValue })),
    transcriptRecords: transcriptRecords.map((t) => ({
      courseCode: t.courseCode, courseTitle: t.courseTitle, creditHours: t.creditHours, termName: t.termName, termYear: t.termYear,
      grade: t.grade, gpaPoints: t.gpaPoints,
    })),
    planned,
  });
}
