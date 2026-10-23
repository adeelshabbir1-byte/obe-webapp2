import { prisma } from "./db";
import { getAuthenticatedStudent } from "./studentSession";
import { getAuthenticatedUser } from "./session";
import { coordinatorIdsFor } from "./reportScope";
import { getGradingScaleForBatch } from "./gradingScaleLookup";
import { planLock, studentContext, loadLimit, selfRegistrationBlock } from "./registrationRules";
import { termIndex } from "./termLogic";
import { courseTermIndex, termLabel } from "./courseTerm";
import { planMeta, setMeta, planRequests, programOfferings } from "./degreePlanner";
import { getPolicy } from "./registrationRules";
import { computeCgpa } from "./academicStanding";

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
  const pre = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinatorId: true } } } });
  if (pre?.batch) await import("./semesterSync").then((m) => m.syncSemesters([pre.batch!.coordinatorId])).catch(() => 0); // semester follows the calendar
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
  const passed = (g: { grade: string; gpaPoints: number | null }) => (g.grade === "P" || g.grade === "TR" || g.grade === "IT") || (g.gpaPoints !== null && g.gpaPoints > 0);
  // Best attempt per course decides whether it is done and whether it is a low grade worth repeating.
  const best = new Map<string, (typeof records)[number]>();
  for (const r of records) { const b = best.get(key(r.courseCode)); if (!b || (r.gpaPoints ?? -1) > (b.gpaPoints ?? -1)) best.set(key(r.courseCode), r); }
  const plan = new Map(entries.map((e) => [e.courseId, e]));
  const enrolled = new Set(enrollments.map((e) => e.courseId));
  const meta = await planMeta(studentId);

  const completed = records.map((r) => {
    const b = best.get(key(r.courseCode))!;
    const course = courses.find((c) => key(c.code) === key(r.courseCode));
    const low = b === r && r.gpaPoints !== null && r.gpaPoints > 0 && r.gpaPoints < LOW_GRADE_POINTS;
    return {
      courseCode: r.courseCode, courseTitle: r.courseTitle, creditHours: r.creditHours, termName: r.termName, termYear: r.termYear, grade: r.grade, gpaPoints: r.gpaPoints,
      semesterNumber: semesterOfTerm(batch.startTerm, batch.startYear, r.termName, r.termYear),
      failed: r.gpaPoints === 0 && r.grade !== "P", lowGrade: low, superseded: b !== r, withdrawn: /^W/i.test(r.grade || ""),
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
        source: e ? meta.get(c.id)?.source || null : null, plannedBatch: e ? meta.get(c.id)?.batchLabel || null : null, summer: !!(e && meta.get(c.id)?.summer),
      };
    });
  const programSemesters = Math.max(8, ...courses.map((c) => c.semesterNumber || 0));

  // Which batch studies each planned course in which term, so a course moved to another semester shows the batch the
  // student would sit with (same institute; same degree program first).
  const baseTerm = termIndex(batch.startTerm, batch.startYear);
  const chairmanId = (await prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { managedById: true } }))?.managedById || null;
  const codes = Array.from(new Set(planned.map((p) => key(p.code))));
  const others = codes.length ? await prisma.course.findMany({
    where: { code: { in: Array.from(new Set(planned.map((p) => p.code))) }, batch: chairmanId ? { coordinator: { managedById: chairmanId } } : { coordinatorId: batch.coordinatorId } },
    select: { code: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, batchId: true, batch: { select: { startTerm: true, startYear: true, degreeProgram: true, batchName: true, studentCount: true } } },
    take: 3000,
  }) : [];
  const offerings: Record<string, { term: number; batch: string; semester: number; ownBatch: boolean; sameProgram: boolean; students: number }[]> = {};
  for (const o of others) {
    const t = courseTermIndex(o);
    if (t === null || !o.batch) continue;
    (offerings[key(o.code)] = offerings[key(o.code)] || []).push({
      term: t, batch: `${o.batch.degreeProgram} — ${o.batch.batchName}`, semester: o.semesterNumber || 0,
      ownBatch: o.batchId === batch.id, sameProgram: o.batch.degreeProgram === batch.degreeProgram, students: o.batch.studentCount || 0,
    });
  }
  const terms: Record<number, string> = {};
  for (let n = 1; n <= Math.max(programSemesters + 6, 16); n++) terms[n] = termLabel(baseTerm + n - 1);
  // Attendance so far in the courses the student is taking now (keyed by course code).
  const attendance: Record<string, { pct: number | null; attended: number; held: number; canMiss: number | null; standing: string; minPct: number }> = {};
  {
    const { attendancePolicy, tally, standing } = await import("./attendance");
    const pol = await attendancePolicy(chairmanId);
    const now = await prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { course: { select: { id: true, code: true } } } });
    for (const { course } of now) {
      const [recs, plannedRows, heldRows] = await Promise.all([
        prisma.attendanceRecord.findMany({ where: { courseId: course.id, studentId }, select: { status: true } }),
        prisma.lectureRow.count({ where: { courseId: course.id, source: "INSTRUCTOR" } }),
        prisma.lectureRow.count({ where: { courseId: course.id, source: "INSTRUCTOR", actualDate: { not: null } } }),
      ]);
      const t = tally(recs.map((r) => r.status));
      const held = Math.max(heldRows, t.marked);
      const st = standing(t, pol, Math.max(0, plannedRows - held));
      attendance[key(course.code)] = { pct: st.pct, attended: t.present + (pol.lateCountsPresent ? t.late : 0), held: t.marked, canMiss: st.canMiss, standing: st.standing, minPct: pol.minPct };
    }
  }
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
    baseTerm, terms, offerings, attendance,
  };
}

/** Changes to the plan. Real grades are never touched. */
export async function changeScheme(studentId: string, action: string, courseId: string, opts: { semesterNumber?: number; grade?: string | null }, by: { kind: "student" | "staff"; id: string } = { kind: "staff", id: "" }) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, currentSemesterNumber: true } });
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, batchId: true, code: true, semesterNumber: true } });
  if (!student || !course || course.batchId !== student.batchId) return { error: "That course is not in this student's program." };
  const where = { studentId_courseId: { studentId, courseId } };
  if (action === "move" || action === "retake") {
    const n = Number(opts.semesterNumber);
    if (!Number.isInteger(n) || n < 1 || n > 16) return { error: "Choose a semester." };
    if (n < student.currentSemesterNumber) return { error: "A course can only be planned in the current or a later semester." };
    const problem = await moveProblem(studentId, course, n, by.kind);
    if (problem) return { error: problem };
    await prisma.degreePlanEntry.upsert({ where, update: { plannedSemesterNumber: n }, create: { studentId, courseId, plannedSemesterNumber: n } });
    await setMeta(studentId, courseId, { source: by.kind === "student" ? "STUDENT" : "ADVISOR", termKey: null, batch: null }, by.id);
  } else if (action === "grade") {
    await prisma.degreePlanEntry.upsert({ where, update: { hypotheticalGrade: opts.grade || null }, create: { studentId, courseId, plannedSemesterNumber: Math.max(course.semesterNumber ?? 1, student.currentSemesterNumber), hypotheticalGrade: opts.grade || null } });
  } else if (action === "cancel") {
    await prisma.degreePlanEntry.deleteMany({ where: { studentId, courseId } });
  } else return { error: "unknown action" };
  return { ok: true };
}


/** Why a course can't go into semester n of this student's plan (null = it can). Anyone: not before its own semester
 * unless approved. The student's own changes must also keep prerequisites in order, find a batch teaching it that term,
 * and stay within the semester's credit-hour limit; the advisor may override those three. */
async function moveProblem(studentId: string, course: { id: string; code: string; semesterNumber: number | null }, n: number, by: "student" | "staff"): Promise<string | null> {
  const up = (x: string) => x.trim().toUpperCase();
  const attempted = new Set((await prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true } })).map((r) => up(r.courseCode)));
  const req = await planRequests(studentId);
  if ((course.semesterNumber || 1) > n && !attempted.has(up(course.code)) && !req.ahead.has(up(course.code)))
    return `${course.code} is a semester-${course.semesterNumber} course. Taking it in semester ${n} needs approval: the advisor can request it (HOD, Chairman or Dean decides).`;
  if (by === "staff") return null;
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { currentSemesterNumber: true, batch: { select: { id: true, coordinatorId: true, degreeProgram: true, coordinator: { select: { managedById: true } } } } } });
  if (!s?.batch) return null;
  const all = await prisma.course.findMany({ where: { batchId: s.batch.id }, select: { id: true, code: true, creditHours: true, isNonCredit: true, semesterNumber: true, prerequisiteCourseId: true } });
  const entries = new Map((await prisma.degreePlanEntry.findMany({ where: { studentId } })).map((e) => [e.courseId, e.plannedSemesterNumber]));
  const passed = new Set((await prisma.studentTranscriptRecord.findMany({ where: { studentId, OR: [{ gpaPoints: { gt: 0 } }, { grade: "P" }] }, select: { courseCode: true } })).map((r) => up(r.courseCode)));
  const semOf = (c: { id: string; semesterNumber: number | null }) => entries.get(c.id) ?? c.semesterNumber ?? 1;
  const me = all.find((c) => c.id === course.id)!;
  const pre = me.prerequisiteCourseId ? all.find((c) => c.id === me.prerequisiteCourseId) : null;
  if (pre && !passed.has(up(pre.code)) && semOf(pre) >= n) return `${course.code} needs ${pre.code} first, which is planned for semester ${semOf(pre)}.`;
  const dep = all.find((c) => c.prerequisiteCourseId === me.id && !passed.has(up(c.code)) && semOf(c) <= n);
  if (dep) return `${dep.code} (semester ${semOf(dep)}) needs ${course.code} first — move it later too, or ask your advisor.`;
  // A batch must be studying it that term (existing or expected batches on today's curriculum).
  const chairmanId = s.batch.coordinator?.managedById || "";
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id);
  const ct = await prisma.currentTerm.findUnique({ where: { coordinatorId: s.batch.coordinatorId }, select: { termName: true, year: true } });
  const nowReg = ct ? termIndex(/fall/i.test(ct.termName) ? "Fall" : "Spring", ct.year) : termIndex(new Date().getMonth() >= 7 ? "Fall" : "Spring", new Date().getFullYear());
  const targetReg = nowReg + (n - s.currentSemesterNumber);
  const { offerings } = await programOfferings(leads.length ? leads : [s.batch.coordinatorId], s.batch.degreeProgram, nowReg, s.batch.id);
  if (!(offerings.get(up(course.code)) || []).some((o) => o.reg === targetReg)) return `No batch studies ${course.code} in semester ${n}'s term — it is taught in other terms. Ask your advisor if you need it then.`;
  const policy = await getPolicy(chairmanId);
  const cgpa = await computeCgpa(studentId);
  const limit = cgpa !== null && cgpa < policy.lowCgpaThreshold ? policy.maxCreditsLowCgpa : policy.maxCreditsNormal;
  const load = all.filter((c) => c.id !== me.id && semOf(c) === n && !passed.has(up(c.code))).reduce((a, c) => a + (c.isNonCredit ? 0 : c.creditHours), 0) + (me.isNonCredit ? 0 : me.creditHours);
  if (load > limit) return `Semester ${n} would have ${load} credit hours — over your limit of ${limit}. Move another course out first.`;
  return null;
}
