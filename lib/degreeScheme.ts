import { prisma } from "./db";
import { getAuthenticatedStudent } from "./studentSession";
import { getAuthenticatedUser } from "./session";
import { coordinatorIdsFor } from "./reportScope";
import { getGradingScaleForBatch } from "./gradingScaleLookup";
import { planLock, studentContext, loadLimit, selfRegistrationBlock } from "./registrationRules";

// The full degree scheme of one student, semester by semester: what was already taken (with the grade, in the semester it
// was taken) and every remaining course in the semester it is planned for. The student, the batch's advisor and the
// program's staff can move planned courses, plan a retake for a failed or D-grade course, and try hypothetical grades -
// so a student below 2.0 CGPA can be given a realistic plan to finish the degree. Nothing here changes real grades.

const STAFF_ROLES = ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN"];
export const LOW_GRADE_POINTS = 2.0; // below this a passed course (D, D+, C-) can be repeated to improve the CGPA

/** Who is asking about which student: the student themself, or a staff member allowed to advise them. */
export async function schemeAccess(studentIdParam?: string | null): Promise<{ studentId: string; by: "student" | "staff"; actorId: string } | null> {
  const student = await getAuthenticatedStudent().catch(() => null);
  if (student && (!studentIdParam || studentIdParam === student.id)) return { studentId: student.id, by: "student", actorId: student.id };
  const user = await getAuthenticatedUser();
  if (!user || !studentIdParam) return null;
  const s = await prisma.student.findUnique({ where: { id: studentIdParam }, select: { id: true, batch: { select: { advisorId: true, coordinatorId: true } } } });
  if (!s?.batch) return null;
  if (s.batch.advisorId === user.id) return { studentId: s.id, by: "staff", actorId: user.id };
  if (STAFF_ROLES.includes(user.role) && (await coordinatorIdsFor(user)).includes(s.batch.coordinatorId)) return { studentId: s.id, by: "staff", actorId: user.id };
  return null;
}

/** Semester number (1, 2, ...) of a term for a batch that started in startTerm startYear. Summer counts with the Spring before it. */
export function semesterOfTerm(startTerm: string, startYear: number, termName: string, termYear: number) {
  const idx = (t: string, y: number) => y * 2 + (/fall/i.test(t) ? 1 : 0);
  return Math.max(1, idx(termName, termYear) - idx(startTerm, startYear) + 1);
}

export async function loadScheme(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { batch: true } });
  if (!student?.batch) return null;
  const batch = student.batch;
  const [records, scale, lead, entries, enrollments, courses] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, orderBy: [{ termYear: "asc" }, { termName: "asc" }] }),
    getGradingScaleForBatch(batch.coordinatorId, batch),
    prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { minCreditsPerSemester: true, maxCreditsPerSemester: true } }),
    prisma.degreePlanEntry.findMany({ where: { studentId } }),
    prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" } }, select: { courseId: true } }),
    prisma.course.findMany({ where: { batchId: batch.id }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, isNonCredit: true, courseType: true } }),
  ]);
  const key = (c: string) => c.trim().toUpperCase();
  const passed = (g: { grade: string; gpaPoints: number | null }) => g.grade === "P" || (g.gpaPoints !== null && g.gpaPoints > 0);
  // Best attempt per course decides whether it is done and whether it is a low grade worth repeating.
  const best = new Map<string, (typeof records)[number]>();
  for (const r of records) { const b = best.get(key(r.courseCode)); if (!b || (r.gpaPoints ?? -1) > (b.gpaPoints ?? -1)) best.set(key(r.courseCode), r); }
  const plan = new Map(entries.map((e) => [e.courseId, e]));
  const enrolled = new Set(enrollments.map((e) => e.courseId));

  const completed = records.map((r) => {
    const b = best.get(key(r.courseCode))!;
    const course = courses.find((c) => key(c.code) === key(r.courseCode));
    const low = b === r && r.gpaPoints !== null && r.gpaPoints > 0 && r.gpaPoints < LOW_GRADE_POINTS;
    return {
      courseCode: r.courseCode, courseTitle: r.courseTitle, creditHours: r.creditHours, termName: r.termName, termYear: r.termYear, grade: r.grade, gpaPoints: r.gpaPoints,
      semesterNumber: semesterOfTerm(batch.startTerm, batch.startYear, r.termName, r.termYear),
      failed: r.gpaPoints === 0 && r.grade !== "P", lowGrade: low, superseded: b !== r,
      courseId: course?.id || null, retakePlanned: !!(course && plan.has(course.id) && passed(b)),
    };
  });
  const planned = courses
    .filter((c) => { const b = best.get(key(c.code)); return !b || !passed(b) || plan.has(c.id); })
    .map((c) => {
      const b = best.get(key(c.code));
      const e = plan.get(c.id);
      return {
        courseId: c.id, code: c.code, title: c.title, creditHours: c.isNonCredit ? 0 : c.creditHours, courseType: c.courseType,
        nativeSemesterNumber: c.semesterNumber, plannedSemesterNumber: e?.plannedSemesterNumber ?? Math.max(c.semesterNumber ?? 1, b ? student.currentSemesterNumber : 1),
        hypotheticalGrade: e?.hypotheticalGrade ?? null, currentlyEnrolled: enrolled.has(c.id),
        kind: !b ? "new" : passed(b) ? "improvement" : "retake", previousGrade: b?.grade ?? null,
      };
    });
  const programSemesters = Math.max(8, ...courses.map((c) => c.semesterNumber || 0));
  const lock = await planLock(studentId);
  const locker = lock ? await prisma.user.findUnique({ where: { id: lock.lockedById }, select: { name: true } }) : null;
  const ctx = await studentContext(studentId);
  const rules = ctx ? { limit: loadLimit(ctx), selfBlocked: !!selfRegistrationBlock(ctx), earned: ctx.earned, maxNew: ctx.policy.maxNewCoursesLowCgpa, lowCgpa: ctx.cgpa !== null && ctx.cgpa < ctx.policy.lowCgpaThreshold, threshold: ctx.policy.lowCgpaThreshold } : null;
  return {
    lock: lock ? { by: locker?.name || "the advisor", at: lock.lockedAt, note: lock.note } : null,
    rules,
    student: { id: student.id, name: student.name, rollNumber: student.rollNumber, currentSemesterNumber: student.currentSemesterNumber, batch: `${batch.degreeProgram} — ${batch.batchName}` },
    programSemesters, maxSemester: Math.max(programSemesters + 4, ...planned.map((p) => p.plannedSemesterNumber), ...completed.map((c) => c.semesterNumber)),
    minCredits: lead?.minCreditsPerSemester ?? 12, maxCredits: lead?.maxCreditsPerSemester ?? 18,
    gradingScale: scale.map((g) => ({ letter: g.letter, gpaValue: g.gpaValue })), completed, planned,
  };
}

/** Changes to the plan. Real grades are never touched. */
export async function changeScheme(studentId: string, action: string, courseId: string, opts: { semesterNumber?: number; grade?: string | null }) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, currentSemesterNumber: true } });
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, batchId: true, code: true, semesterNumber: true } });
  if (!student || !course || course.batchId !== student.batchId) return { error: "That course is not in this student's program." };
  const where = { studentId_courseId: { studentId, courseId } };
  if (action === "move" || action === "retake") {
    const n = Number(opts.semesterNumber);
    if (!Number.isInteger(n) || n < 1 || n > 16) return { error: "Choose a semester." };
    if (n < student.currentSemesterNumber) return { error: "A course can only be planned in the current or a later semester." };
    await prisma.degreePlanEntry.upsert({ where, update: { plannedSemesterNumber: n }, create: { studentId, courseId, plannedSemesterNumber: n } });
  } else if (action === "grade") {
    await prisma.degreePlanEntry.upsert({ where, update: { hypotheticalGrade: opts.grade || null }, create: { studentId, courseId, plannedSemesterNumber: Math.max(course.semesterNumber ?? 1, student.currentSemesterNumber), hypotheticalGrade: opts.grade || null } });
  } else if (action === "cancel") {
    await prisma.degreePlanEntry.deleteMany({ where: { studentId, courseId } });
  } else return { error: "unknown action" };
  return { ok: true };
}
