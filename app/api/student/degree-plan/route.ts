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

  // "Critical chain" — a course whose prerequisite chain has zero slack
  // left before the final semester of the program, i.e. failing it (and
  // so retaking it a semester later) would push the whole chain of
  // courses that require it past graduation. Computed as: how many more
  // semesters does the longest remaining prerequisite chain STARTING at
  // this course need (including itself), versus how many semesters are
  // actually left until the program's final semester from where this
  // course is currently planned. Zero (or negative) slack = critical.
  const maxProgramSemester = allBatchCourses.reduce((max, c) => Math.max(max, c.semesterNumber || 0), 0);
  const postrequisitesOf = new Map<string, string[]>();
  for (const c of allBatchCourses) {
    if (!c.prerequisiteCourseId) continue;
    postrequisitesOf.set(c.prerequisiteCourseId, [...(postrequisitesOf.get(c.prerequisiteCourseId) || []), c.id]);
  }
  const chainDepthCache = new Map<string, number>();
  function chainDepth(courseId: string, visiting: Set<string> = new Set()): number {
    if (chainDepthCache.has(courseId)) return chainDepthCache.get(courseId)!;
    if (visiting.has(courseId)) return 1; // guard against a bad/cyclic prerequisite link — never loop forever
    visiting.add(courseId);
    const posts = postrequisitesOf.get(courseId) || [];
    const depth = 1 + posts.reduce((max, postId) => Math.max(max, chainDepth(postId, visiting)), 0);
    chainDepthCache.set(courseId, depth);
    return depth;
  }

  const planned = allBatchCourses.map((c) => {
    const entry = planByCourseId.get(c.id);
    const plannedSemesterNumber = entry?.plannedSemesterNumber ?? c.semesterNumber ?? 1;
    const semestersRemaining = maxProgramSemester - plannedSemesterNumber + 1;
    const depth = chainDepth(c.id);
    return {
      courseId: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
      nativeSemesterNumber: c.semesterNumber,
      plannedSemesterNumber,
      hypotheticalGrade: entry?.hypotheticalGrade ?? null,
      currentlyEnrolled: enrolledIds.has(c.id),
      isCriticalChain: depth >= semestersRemaining,
      chainDepth: depth,
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
