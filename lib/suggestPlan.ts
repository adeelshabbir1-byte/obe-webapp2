import { prisma } from "./db";
import { recordMove, snapshot } from "./planHistory";
import { suggestPlan, type PCourse } from "./suggestPlanCore";

// Loads a student's remaining courses for "Suggest plan" (Adeel prompt §21.3–4) and applies a result as a new plan version.
// "Offered in semester s": the course's own scheme semester has the same parity (Fall / Spring), or the program has
// offered that code in semester s before. Probation lowers the max load (lib/academicRules probationMaxCh, else 12).
export async function suggestFor(studentId: string, opts: { min: number; max: number; excluded?: number[] }) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, currentSemesterNumber: true, batch: { select: { degreeProgram: true } } } });
  if (!st) return null;
  const [courses, recs, history] = await Promise.all([
    prisma.course.findMany({ where: { batchId: st.batchId }, select: { id: true, code: true, creditHours: true, semesterNumber: true, courseType: true, prerequisiteCourseId: true } }),
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, grade: true } }),
    prisma.course.findMany({ where: { batch: { degreeProgram: st.batch?.degreeProgram } }, select: { code: true, semesterNumber: true }, take: 5000 }),
  ]);
  const up = (s: string) => s.trim().toUpperCase();
  const gradeOf = new Map<string, string>(); for (const r of recs) gradeOf.set(up(r.courseCode), r.grade.trim().toUpperCase());
  const passedCodes = new Set(Array.from(gradeOf.entries()).filter(([, g]) => !/^(F|W|I|ABS)$/.test(g)).map(([k]) => k));
  const offeredAt = new Map<string, Set<number>>();
  for (const h of history) if (h.semesterNumber) { const k = up(h.code); offeredAt.set(k, (offeredAt.get(k) || new Set()).add(h.semesterNumber)); }
  const passedIds = new Set(courses.filter((c) => passedCodes.has(up(c.code))).map((c) => c.id));
  const remaining: PCourse[] = courses.filter((c) => !passedIds.has(c.id)).map((c) => ({
    id: c.id, code: c.code, ch: c.creditHours, scheme: c.semesterNumber, core: !/elective/i.test(c.courseType), failed: gradeOf.get(up(c.code)) === "F", prereq: c.prerequisiteCourseId,
    allowed: (s: number) => (c.semesterNumber ? s % 2 === c.semesterNumber % 2 : true) || !!offeredAt.get(up(c.code))?.has(s),
  }));
  const out = suggestPlan({ courses: remaining, passed: passedIds, fromSem: Math.max(1, st.currentSemesterNumber), min: opts.min, max: opts.max, excluded: opts.excluded });
  const batchEnd = Math.max(8, ...courses.map((c) => c.semesterNumber || 0));
  return { ...out, current: st.currentSemesterNumber, batchEnd, ids: Object.fromEntries(remaining.map((c) => [c.code, c.id])) };
}

/** Save a suggested plan: every moved course is recorded with the reason, then a plan version is taken. */
export async function applySuggested(studentId: string, bySem: Record<number, string[]>, ids: Record<string, string>, byId: string) {
  let moved = 0;
  for (const [sem, codes] of Object.entries(bySem)) for (const code of codes) {
    const courseId = ids[code]; if (!courseId) continue;
    const before = await prisma.degreePlanEntry.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { plannedSemesterNumber: true } });
    if (before?.plannedSemesterNumber === Number(sem)) continue;
    await recordMove(studentId, courseId, before?.plannedSemesterNumber ?? null, Number(sem), byId, "Suggest plan", null);
    await prisma.degreePlanEntry.upsert({ where: { studentId_courseId: { studentId, courseId } }, update: { plannedSemesterNumber: Number(sem) }, create: { studentId, courseId, plannedSemesterNumber: Number(sem) } });
    moved++;
  }
  await snapshot(studentId, byId, "SNAPSHOT", `Suggested plan saved (${moved} course${moved === 1 ? "" : "s"} moved)`, "Suggest plan").catch(() => null);
  return moved;
}
