import { prisma } from "./db";
import { computeCgpa, standingFromCgpa } from "./academicStanding";

// Registration rules of an institute (set by the OMC on the Registration Rules page) and the exemptions the Institute
// Head grants. Every place that registers a student checks a course here first.
//
// The three tables are new; they are reached through a loose handle so this file compiles before `prisma generate`.
const db = prisma as unknown as Record<string, any>;

export type CreditRule = { label: string; codes: string[]; titleContains: string; minCredits: number };
export type Policy = {
  lowCgpaThreshold: number; minCreditsNormal: number; maxCreditsNormal: number; maxCreditsLowCgpa: number; maxNewCoursesLowCgpa: number;
  maxCreditsFinalYear: number; maxCreditsSummer: number; allowConcurrentPrereq: boolean; creditRules: CreditRule[];
};
export const DEFAULT_POLICY: Policy = {
  lowCgpaThreshold: 2.0, minCreditsNormal: 12, maxCreditsNormal: 18, maxCreditsLowCgpa: 15, maxNewCoursesLowCgpa: 2,
  maxCreditsFinalYear: 21, maxCreditsSummer: 9, allowConcurrentPrereq: false,
  creditRules: [{ label: "Final Year Project", codes: [], titleContains: "Final Year Project", minCredits: 95 }],
};
export const EXEMPTION_RULES: Record<string, string> = {
  CREDIT_REQUIREMENT: "Earned credit hours needed for a course (e.g. FYP)",
  MAX_LOAD: "Maximum credit hours in a semester",
  NEW_COURSE_LIMIT: "Number of new courses while CGPA is low",
  CONCURRENT_PREREQ: "Take a course in the same semester as its prerequisite",
  SELF_REGISTRATION: "Allow self-registration despite low CGPA / warning / probation",
};

export async function getPolicy(chairmanId: string): Promise<Policy> {
  try {
    const row = await db.registrationPolicy.findUnique({ where: { chairmanId } });
    if (!row) return DEFAULT_POLICY;
    let rules: CreditRule[] = [];
    try { rules = JSON.parse(row.creditRules || "[]"); } catch { rules = []; }
    return { ...DEFAULT_POLICY, ...row, creditRules: rules };
  } catch {
    return DEFAULT_POLICY; // the table is not created yet (SQL not run) - fall back to the defaults
  }
}

async function exemptions(studentId: string): Promise<{ rule: string; courseCode: string | null; value: number | null }[]> {
  try { return await db.registrationExemption.findMany({ where: { studentId, revokedAt: null } }); } catch { return []; }
}
export async function planLock(studentId: string): Promise<{ lockedById: string; note: string | null; lockedAt: Date } | null> {
  try { return await db.degreePlanLock.findUnique({ where: { studentId } }); } catch { return null; }
}

const up = (s: string) => s.trim().toUpperCase();

/** Everything about the student the rules need, loaded once. */
export async function studentContext(studentId: string, termName?: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { batch: { include: { coordinator: { select: { managedById: true } } } } } });
  if (!student?.batch) return null;
  const chairmanId = student.batch.coordinator?.managedById || "";
  if (termName === undefined) termName = (await prisma.currentTerm.findUnique({ where: { coordinatorId: student.batch.coordinatorId }, select: { termName: true } }))?.termName || "";
  const [policy, ex, records, enrolled, programMax] = await Promise.all([
    getPolicy(chairmanId), exemptions(studentId),
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, creditHours: true, gpaPoints: true, grade: true } }),
    prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { course: { select: { id: true, code: true, creditHours: true, isNonCredit: true } } } }),
    prisma.course.aggregate({ where: { batchId: student.batchId }, _max: { semesterNumber: true } }),
  ]);
  const cgpa = await computeCgpa(studentId);
  const passed = new Map<string, number>();
  for (const r of records) if ((r.gpaPoints !== null && r.gpaPoints > 0) || r.grade === "P") passed.set(up(r.courseCode), r.creditHours);
  const attempted = new Set(records.map((r) => up(r.courseCode)));
  const lastSem = Math.max(8, programMax._max.semesterNumber || 0);
  return {
    student, chairmanId, policy, ex, cgpa, standing: standingFromCgpa(cgpa),
    earned: Array.from(passed.values()).reduce((n, c) => n + c, 0), passed, attempted,
    current: enrolled.map((e) => e.course).filter((c): c is NonNullable<typeof c> => !!c),
    finalYear: student.currentSemesterNumber >= lastSem - 1, summer: /summer/i.test(termName || ""),
  };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof studentContext>>>;

const exempt = (ctx: Ctx, rule: string, code?: string) => ctx.ex.find((e) => e.rule === rule && (!e.courseCode || !code || up(e.courseCode) === up(code)));

/** May this student register themself at all? (low CGPA / warning / probation students are registered by their advisor) */
export function selfRegistrationBlock(ctx: Ctx): string | null {
  if (exempt(ctx, "SELF_REGISTRATION")) return null;
  const low = ctx.cgpa !== null && ctx.cgpa < ctx.policy.lowCgpaThreshold;
  if (low || ctx.standing !== "GOOD_STANDING") {
    return `Your CGPA is ${ctx.cgpa?.toFixed(2)} (${ctx.standing === "PROBATION" ? "probation" : ctx.standing === "WARNING" ? "warning" : "below " + ctx.policy.lowCgpaThreshold.toFixed(2)}), so you can't register yourself. Your course advisor sets and locks your degree plan, and you are registered from it.`;
  }
  return null;
}

/** The semester credit-hour limit that applies to this student, and why. */
export function loadLimit(ctx: Ctx): { max: number; why: string } {
  const ex = exempt(ctx, "MAX_LOAD");
  if (ex?.value) return { max: ex.value, why: "exemption granted by the Institute Head" };
  const p = ctx.policy;
  if (ctx.summer) return { max: p.maxCreditsSummer, why: "summer semester" };
  const low = ctx.cgpa !== null && ctx.cgpa < p.lowCgpaThreshold;
  if (low) return { max: p.maxCreditsLowCgpa, why: `CGPA below ${p.lowCgpaThreshold.toFixed(2)}` };
  if (ctx.finalYear) return { max: p.maxCreditsFinalYear, why: "final-year student" };
  return { max: p.maxCreditsNormal, why: "normal semester" };
}

/**
 * Checks a set of courses to be added this semester, in order. Returns which may be registered and why the others may not.
 * Courses already registered this semester count toward the load and the new-course limit.
 */
export async function checkCourses(ctx: Ctx, courses: { id: string; code: string; title: string; creditHours: number; isNonCredit?: boolean; prerequisiteCourseId: string | null }[]) {
  const p = ctx.policy;
  const limit = loadLimit(ctx);
  let load = ctx.current.reduce((n, c) => n + (c.isNonCredit ? 0 : c.creditHours), 0);
  const low = ctx.cgpa !== null && ctx.cgpa < p.lowCgpaThreshold;
  const newExempt = exempt(ctx, "NEW_COURSE_LIMIT");
  const newLimit = newExempt?.value ?? p.maxNewCoursesLowCgpa;
  let newCount = ctx.current.filter((c) => !ctx.attempted.has(up(c.code))).length;
  const thisTerm = new Set(ctx.current.map((c) => c.id));
  const ok: string[] = [];
  const blocked: { courseId: string; code: string; reason: string }[] = [];

  for (const c of courses) {
    const code = up(c.code);
    // 1. Earned credit hours (e.g. FYP needs 95).
    const rule = p.creditRules.find((r) => (r.codes || []).some((x) => up(x) === code) || (r.titleContains && c.title.toLowerCase().includes(r.titleContains.toLowerCase())));
    if (rule && ctx.earned < rule.minCredits && !exempt(ctx, "CREDIT_REQUIREMENT", c.code)) {
      blocked.push({ courseId: c.id, code: c.code, reason: `${rule.label || c.title} needs ${rule.minCredits} earned credit hours; ${ctx.earned} earned so far.` }); continue;
    }
    // 2. Prerequisite passed (or, if allowed, taken in the same semester).
    if (c.prerequisiteCourseId) {
      const pre = await prisma.course.findUnique({ where: { id: c.prerequisiteCourseId }, select: { id: true, code: true, title: true } });
      if (pre && !ctx.passed.has(up(pre.code))) {
        const together = thisTerm.has(pre.id) || ctx.current.some((x) => up(x.code) === up(pre.code)) || ok.includes(pre.id);
        const concurrentOk = (p.allowConcurrentPrereq || exempt(ctx, "CONCURRENT_PREREQ", c.code)) && together;
        if (!concurrentOk) {
          blocked.push({ courseId: c.id, code: c.code, reason: `Prerequisite ${pre.code} ${pre.title} is not passed${p.allowConcurrentPrereq ? " (or registered this semester)" : ""}.` }); continue;
        }
      }
    }
    // 3. New-course limit while CGPA is low (retakes and repeats don't count).
    const isNew = !ctx.attempted.has(code);
    if (low && isNew && newCount >= newLimit) {
      blocked.push({ courseId: c.id, code: c.code, reason: `CGPA below ${p.lowCgpaThreshold.toFixed(2)}: at most ${newLimit} new course(s) per semester; retakes come first.` }); continue;
    }
    // 4. Semester load.
    const cr = c.isNonCredit ? 0 : c.creditHours;
    if (load + cr > limit.max) {
      blocked.push({ courseId: c.id, code: c.code, reason: `Would make ${load + cr} credit hours; the limit is ${limit.max} (${limit.why}).` }); continue;
    }
    load += cr; if (isNew) newCount++; ok.push(c.id); thisTerm.add(c.id);
  }
  return { ok, blocked, load, limit };
}

/**
 * Registers a student from their (advisor-locked) degree plan for the current semester. For each planned course it uses
 * the student's own batch course when it is offered, otherwise an offered course with the same code in another batch of
 * the same program (a retake). Rules are applied; what can't be registered is reported, not forced.
 */
export async function registerFromPlan(studentId: string, termName?: string) {
  const ctx = await studentContext(studentId, termName);
  if (!ctx) return { error: "student not found" };
  const entries = await prisma.degreePlanEntry.findMany({ where: { studentId, plannedSemesterNumber: ctx.student.currentSemesterNumber }, include: { course: true } });
  const own = await prisma.course.findMany({ where: { batchId: ctx.student.batchId, semesterNumber: ctx.student.currentSemesterNumber } });
  // Courses of the current semester that have no plan entry follow the batch's own semester unless moved.
  const movedAway = new Set((await prisma.degreePlanEntry.findMany({ where: { studentId, NOT: { plannedSemesterNumber: ctx.student.currentSemesterNumber } }, select: { courseId: true } })).map((e) => e.courseId));
  const wanted = [...entries.map((e) => e.course), ...own.filter((c) => !movedAway.has(c.id) && !entries.some((e) => e.courseId === c.id))]
    .filter((c) => !ctx.passed.has(up(c.code)) || entries.some((e) => e.courseId === c.id)); // passed courses only when planned as a repeat
  const offered: typeof own = [];
  const notOffered: string[] = [];
  for (const c of wanted) {
    if (c.isOffered) { offered.push(c); continue; }
    const alt = await prisma.course.findFirst({ where: { code: c.code, isOffered: true, coordinatorId: ctx.student.batch!.coordinatorId, batch: { degreeProgram: ctx.student.batch!.degreeProgram } } });
    if (alt) offered.push(alt); else notOffered.push(`${c.code} ${c.title}`);
  }
  const already = new Set((await prisma.studentEnrollment.findMany({ where: { studentId }, select: { courseId: true } })).map((e) => e.courseId));
  const toCheck = offered.filter((c) => !already.has(c.id));
  // Retakes first, so a low-CGPA student's limited load goes to clearing failed and low grades.
  toCheck.sort((a, b) => Number(!ctx.attempted.has(up(a.code))) - Number(!ctx.attempted.has(up(b.code))));
  const res = await checkCourses(ctx, toCheck);
  for (const id of res.ok) {
    const c = toCheck.find((x) => x.id === id)!;
    await prisma.studentEnrollment.create({ data: { studentId, courseId: id, isRepeat: c.batchId !== ctx.student.batchId || ctx.attempted.has(up(c.code)) } }).catch(() => {});
  }
  return { registered: res.ok.map((id) => toCheck.find((x) => x.id === id)!.code), blocked: res.blocked, notOffered, load: res.load, limit: res.limit };
}
