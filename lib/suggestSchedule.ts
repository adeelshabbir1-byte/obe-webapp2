import { prisma } from "./db";

const DEFAULT_MIN_CREDITS = 12;
const DEFAULT_MAX_CREDITS = 18;
const MAX_SEMESTER_LOOKAHEAD = 16; // safety cap so a bad prerequisite loop can't search forever

export type SuggestedCourse = {
  courseId: string; code: string; title: string; creditHours: number; courseType: string;
  nativeSemesterNumber: number | null;
  suggestedSemesterNumber: number;
  isRetake: boolean; // previously failed or withdrawn
  offeringConfirmed: boolean; // true if some batch has actually run this course at that semester number; false = odd/even Fall/Spring guess
  overCredit: boolean; // true if this pushed the semester over the max-credit policy (still placed, just flagged)
};

export type SuggestedSchedule = {
  minCreditsPerSemester: number; maxCreditsPerSemester: number;
  currentSemesterNumber: number;
  bySemester: { semesterNumber: number; termLabel: string; totalCredits: number; courses: SuggestedCourse[] }[];
};

function parityTermLabel(semesterNumber: number): "Fall" | "Spring" {
  return semesterNumber % 2 === 1 ? "Fall" : "Spring";
}

/**
 * Builds a suggested semester-by-semester schedule to finish the degree:
 * prerequisite order (topological), credit-load balancing against the
 * coordinator's min/max policy, and course availability — preferring a
 * CONFIRMED future offering (another batch's copy of the same course code,
 * in the same degree program, actually scheduled at that semester number)
 * and falling back to the odd=Fall/even=Spring assumption when no such
 * confirmation exists. Pure computation, no writes — callers decide
 * whether/when to persist this via DegreePlanEntry.
 */
export async function suggestSchedule(studentId: string): Promise<SuggestedSchedule | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { batch: true } });
  if (!student || !student.batch) return null;
  const batch = student.batch;

  const [transcriptRecords, coordinator, activeEnrollments, allBatchCourses] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId } }),
    prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { minCreditsPerSemester: true, maxCreditsPerSemester: true } }),
    prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" } }, select: { courseId: true } }),
    prisma.course.findMany({ where: { batchId: batch.id } }),
  ]);

  const maxCreditsPerSemester = coordinator?.maxCreditsPerSemester ?? DEFAULT_MAX_CREDITS;
  const minCreditsPerSemester = coordinator?.minCreditsPerSemester ?? DEFAULT_MIN_CREDITS;

  // A course only counts as done if actually PASSED — failed/withdrawn
  // attempts must be re-scheduled, same fix as the degree-plan API.
  const passedCodes = new Set(transcriptRecords.filter((t) => t.gpaPoints !== null && t.gpaPoints > 0).map((t) => t.courseCode));
  const failedOrWithdrawnCodes = new Set(
    transcriptRecords.filter((t) => !(t.gpaPoints !== null && t.gpaPoints > 0)).map((t) => t.courseCode)
  );
  const activeEnrolledIds = new Set(activeEnrollments.map((e) => e.courseId));

  // Courses still needed: not passed, and not already an active enrollment
  // this term (those are fixed in place — the student is already taking
  // them right now, nothing to suggest there).
  const toSchedule = allBatchCourses.filter((c) => !passedCodes.has(c.code) && !activeEnrolledIds.has(c.id));
  if (toSchedule.length === 0) return null;

  // Real offering-confirmation signal: has ANY batch of this same degree
  // program actually run a course with this code at this semester number?
  // (Each batch owns its own copy of every course, so "the same course
  // offered under a later batch" is exactly a same-code row elsewhere.)
  const sameProgramCourses = await prisma.course.findMany({
    where: { code: { in: toSchedule.map((c) => c.code) }, batch: { degreeProgram: batch.degreeProgram } },
    select: { code: true, semesterNumber: true },
  });
  const confirmedSemestersByCode = new Map<string, Set<number>>();
  for (const c of sameProgramCourses) {
    if (c.semesterNumber === null) continue;
    const set = confirmedSemestersByCode.get(c.code) || new Set<number>();
    set.add(c.semesterNumber);
    confirmedSemestersByCode.set(c.code, set);
  }

  function canOfferAt(code: string, nativeSemesterNumber: number | null, targetSemesterNumber: number): { ok: boolean; confirmed: boolean } {
    const confirmedSet = confirmedSemestersByCode.get(code);
    if (confirmedSet?.has(targetSemesterNumber)) return { ok: true, confirmed: true };
    if (nativeSemesterNumber === null) return { ok: true, confirmed: false }; // no native slot at all — nothing to check parity against
    return { ok: parityTermLabel(nativeSemesterNumber) === parityTermLabel(targetSemesterNumber), confirmed: false };
  }

  // Topological order (Kahn's algorithm) so a prerequisite is always placed
  // before anything that depends on it. Priority within each "ready" batch:
  // retakes (failed/withdrawn) first, then earliest native semester.
  const idsToSchedule = new Set(toSchedule.map((c) => c.id));
  const indegree = new Map<string, number>();
  const postreqsOf = new Map<string, typeof toSchedule>();
  for (const c of toSchedule) {
    const hasUnresolvedPrereq = !!c.prerequisiteCourseId && idsToSchedule.has(c.prerequisiteCourseId);
    indegree.set(c.id, hasUnresolvedPrereq ? 1 : 0);
    if (c.prerequisiteCourseId) postreqsOf.set(c.prerequisiteCourseId, [...(postreqsOf.get(c.prerequisiteCourseId) || []), c]);
  }
  function priority(c: typeof toSchedule[number]) {
    return [failedOrWithdrawnCodes.has(c.code) ? 0 : 1, c.semesterNumber ?? 999, c.code] as const;
  }
  const ready = toSchedule.filter((c) => indegree.get(c.id) === 0);
  const order: typeof toSchedule = [];
  const placedIds = new Set<string>();
  while (ready.length > 0) {
    ready.sort((a, b) => {
      const pa = priority(a), pb = priority(b);
      return pa[0] - pb[0] || pa[1] - pb[1] || pa[2].localeCompare(pb[2]);
    });
    const c = ready.shift()!;
    if (placedIds.has(c.id)) continue;
    order.push(c); placedIds.add(c.id);
    for (const post of postreqsOf.get(c.id) || []) {
      const left = (indegree.get(post.id) || 0) - 1;
      indegree.set(post.id, left);
      if (left === 0) ready.push(post);
    }
  }
  // Anything left over is a prerequisite cycle (shouldn't normally happen)
  // — append it anyway so nothing silently vanishes from the plan.
  for (const c of toSchedule) if (!placedIds.has(c.id)) order.push(c);

  const placedSemesterByCourseId = new Map<string, number>();
  const creditsBySemester = new Map<number, number>();
  const results: SuggestedCourse[] = [];

  for (const c of order) {
    const prereqSemester = c.prerequisiteCourseId ? placedSemesterByCourseId.get(c.prerequisiteCourseId) : undefined;
    const earliestAllowed = Math.max(student.currentSemesterNumber, (prereqSemester ?? 0) + 1);

    let chosen: number | null = null;
    let confirmed = false;
    let overCredit = false;
    for (let s = earliestAllowed; s < earliestAllowed + MAX_SEMESTER_LOOKAHEAD; s++) {
      const avail = canOfferAt(c.code, c.semesterNumber, s);
      if (!avail.ok) continue;
      const used = creditsBySemester.get(s) || 0;
      if (used + c.creditHours <= maxCreditsPerSemester) {
        chosen = s; confirmed = avail.confirmed; break;
      }
      if (chosen === null) { chosen = s; confirmed = avail.confirmed; overCredit = true; } // fallback candidate if nothing fits under cap
    }
    if (chosen === null) chosen = earliestAllowed; // degenerate fallback, should be unreachable given the lookahead window

    placedSemesterByCourseId.set(c.id, chosen);
    creditsBySemester.set(chosen, (creditsBySemester.get(chosen) || 0) + c.creditHours);
    results.push({
      courseId: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
      nativeSemesterNumber: c.semesterNumber, suggestedSemesterNumber: chosen,
      isRetake: failedOrWithdrawnCodes.has(c.code), offeringConfirmed: confirmed, overCredit,
    });
  }

  const semesterNumbers = Array.from(new Set(results.map((r) => r.suggestedSemesterNumber))).sort((a, b) => a - b);
  const bySemester = semesterNumbers.map((n) => ({
    semesterNumber: n, termLabel: parityTermLabel(n),
    totalCredits: creditsBySemester.get(n) || 0,
    courses: results.filter((r) => r.suggestedSemesterNumber === n).sort((a, b) => a.code.localeCompare(b.code)),
  }));

  return { minCreditsPerSemester, maxCreditsPerSemester, currentSemesterNumber: student.currentSemesterNumber, bySemester };
}
