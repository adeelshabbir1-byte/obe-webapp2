import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { getGradingScaleForBatch } from "../../../../../../lib/gradingScaleLookup";

const DEFAULT_MIN_CREDITS = 12;
const DEFAULT_MAX_CREDITS = 18;

// Advisor-facing counterpart to /api/student/degree-plan — same shape,
// plus the student's live current-semester enrollments (so the advisor
// can drop one directly), for exactly the "student is on probation,
// needs to drop something this semester and get a future-semester plan
// for retaking it" workflow. Read-only lookup here; the move and
// drop-enrollment endpoints do the actual changes.
export async function GET(req: Request, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || !student.batch || student.batch.advisorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const batch = student.batch;

  const [transcriptRecords, gradingScale, coordinator, degreePlanEntries, enrollments] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId: student.id }, orderBy: [{ termYear: "asc" }, { termName: "asc" }] }),
    getGradingScaleForBatch(batch.coordinatorId, batch),
    prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { minCreditsPerSemester: true, maxCreditsPerSemester: true } }),
    prisma.degreePlanEntry.findMany({ where: { studentId: student.id }, include: { course: true } }),
    prisma.studentEnrollment.findMany({ where: { studentId: student.id, status: { not: "WITHDRAWN" } }, include: { course: true } }),
  ]);

  // Only a PASSED attempt counts as "completed" — a failed or withdrawn
  // course must stay available to replan a retake for.
  const takenCourseCodes = new Set(transcriptRecords.filter((t) => t.gpaPoints !== null && t.gpaPoints > 0).map((t) => t.courseCode));
  const enrolledIds = new Set(enrollments.map((e) => e.courseId));
  const planByCourseId = new Map(degreePlanEntries.map((e) => [e.courseId, e]));

  const allBatchCourses = await prisma.course.findMany({
    where: { batchId: batch.id, code: { notIn: Array.from(takenCourseCodes) } },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });

  // Same critical-chain computation as the student's own degree plan —
  // an advisor replanning around a dropped course needs to see this too.
  const maxProgramSemester = allBatchCourses.reduce((max, c) => Math.max(max, c.semesterNumber || 0), 0);
  const postrequisitesOf = new Map<string, string[]>();
  for (const c of allBatchCourses) {
    if (!c.prerequisiteCourseId) continue;
    postrequisitesOf.set(c.prerequisiteCourseId, [...(postrequisitesOf.get(c.prerequisiteCourseId) || []), c.id]);
  }
  const chainDepthCache = new Map<string, number>();
  function chainDepth(courseId: string, visiting: Set<string> = new Set()): number {
    if (chainDepthCache.has(courseId)) return chainDepthCache.get(courseId)!;
    if (visiting.has(courseId)) return 1;
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
    studentName: student.name, rollNumber: student.rollNumber,
    currentSemesterNumber: student.currentSemesterNumber,
    minCreditsPerSemester: coordinator?.minCreditsPerSemester ?? DEFAULT_MIN_CREDITS,
    maxCreditsPerSemester: coordinator?.maxCreditsPerSemester ?? DEFAULT_MAX_CREDITS,
    gradingScale: gradingScale.map((g) => ({ letter: g.letter, gpaValue: g.gpaValue })),
    transcriptRecords: transcriptRecords.map((t) => ({
      courseCode: t.courseCode, courseTitle: t.courseTitle, creditHours: t.creditHours, termName: t.termName, termYear: t.termYear,
      grade: t.grade, gpaPoints: t.gpaPoints,
    })),
    currentEnrollments: enrollments.map((e) => ({ courseId: e.courseId, code: e.course.code, title: e.course.title, creditHours: e.course.creditHours })),
    planned,
  });
}
