import { prisma } from "./db";
import { computeResultMate } from "./resultMate";
import { classStats, gradeWithCutoffs } from "./grading";

// Where a student stands in each course they are taking now, for the advisor: marks so far against the class, position
// and band (top 10% / 20% / 30%), the grade the marks so far point to, and the grade planned for it. Plus, for courses
// already finished, the grade that was planned beside the grade earned.

export type ItemLine = { label: string; type: string; max: number; score: number | null; classAvg: number | null };
export type CourseStatus = {
  courseId: string; code: string; title: string; creditHours: number;
  assessedWeight: number; earned: number; pctSoFar: number | null; classAvgPct: number | null;
  rank: number | null; classSize: number; band: string | null; expectedGrade: string | null; plannedGrade: string | null;
  items: ItemLine[]; submitted: number; given: number;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

function bandOf(rank: number, n: number) {
  const p = rank / n;
  return p <= 0.1 ? "Top 10%" : p <= 0.2 ? "Top 20%" : p <= 0.3 ? "Top 30%" : p <= 0.5 ? "Top half" : p <= 0.75 ? "Lower half" : "Bottom 25%";
}

export async function liveCourseStatus(studentId: string): Promise<CourseStatus[]> {
  const enrolments = await prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { course: { select: { id: true, code: true, title: true, creditHours: true } } } });
  const plan = await prisma.degreePlanEntry.findMany({ where: { studentId, courseId: { in: enrolments.map((e) => e.course.id).concat(["none"]) } }, select: { courseId: true, hypotheticalGrade: true } });
  const planned = new Map(plan.map((p) => [p.courseId, p.hypotheticalGrade]));
  const frozen = await frozenPlans(studentId);
  const terms = new Map((await prisma.course.findMany({ where: { id: { in: enrolments.map((e) => e.course.id).concat(["none"]) } }, select: { id: true, offeredTermName: true, offeredTermYear: true } })).map((c) => [c.id, `${c.offeredTermName}|${c.offeredTermYear}`]));
  const out: CourseStatus[] = [];
  for (const { course } of enrolments) {
    const [rm, weights] = await Promise.all([
      computeResultMate(course.id).catch(() => null),
      prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, select: { id: true, marksPct: true } }),
    ]);
    const base: CourseStatus = { courseId: course.id, code: course.code, title: course.title, creditHours: course.creditHours, assessedWeight: 0, earned: 0, pctSoFar: null, classAvgPct: null, rank: null, classSize: 0, band: null, expectedGrade: null, plannedGrade: frozen.get(`${course.code.trim().toUpperCase()}|${terms.get(course.id)}`) || planned.get(course.id) || null, items: [], submitted: 0, given: 0 };
    if (!rm) { out.push(base); continue; }
    const w = new Map(weights.map((x) => [x.id, x.marksPct]));
    // Assessments that have been marked for anyone in the class so far, and their weight.
    const marked = rm.instruments.filter((i) => i.average !== null);
    const assessedWeight = marked.reduce((a, i) => a + (w.get(i.id) || 0), 0);
    // Each student's marks so far as a % of the weight assessed so far — comparable before the course ends.
    const pctOf = (raw: Record<string, number | null>) => {
      if (!assessedWeight) return null;
      const got = marked.reduce((a, i) => a + (raw[i.id] != null ? ((raw[i.id] as number) / i.maxScore) * (w.get(i.id) || 0) : 0), 0);
      return (100 * got) / assessedWeight;
    };
    const all = rm.rows.map((r) => ({ id: r.studentId, pct: pctOf(r.rawScores) })).filter((x): x is { id: string; pct: number } => x.pct !== null);
    const me = rm.rows.find((r) => r.studentId === studentId);
    const mine = me ? pctOf(me.rawScores) : null;
    const sortedPcts = all.map((x) => x.pct).sort((a, b) => b - a);
    const rank = mine !== null ? sortedPcts.findIndex((p) => p <= mine + 1e-9) + 1 : null;
    const { mean, sd } = classStats(all.map((x) => x.pct));
    const items: ItemLine[] = rm.instruments.map((i) => ({ label: i.label, type: i.type, max: i.maxScore, score: me ? (me.rawScores[i.id] ?? null) : null, classAvg: i.average }));
    out.push({
      ...base,
      assessedWeight: r1(assessedWeight), earned: me ? r1(me.totalPct) : 0,
      pctSoFar: mine !== null ? r1(mine) : null, classAvgPct: all.length ? r1(mean) : null,
      rank, classSize: all.length, band: rank && all.length >= 5 ? bandOf(rank, all.length) : null,
      // If the marks so far held to the end: saved cutoffs if the teacher set them, else the class's mean/SD scheme.
      expectedGrade: mine !== null ? gradeWithCutoffs(mine, rm.savedCutoffs, mean, sd) : null,
      items, submitted: items.filter((x) => x.score !== null).length, given: marked.length,
    });
  }
  return out;
}

/** Finished courses: the grade planned (target grade in the degree plan) beside the grade earned. */
export async function plannedVsActual(studentId: string) {
  const [records, plan] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, orderBy: [{ termYear: "desc" }, { termName: "desc" }], select: { courseCode: true, courseTitle: true, termName: true, termYear: true, grade: true, creditHours: true } }),
    prisma.degreePlanEntry.findMany({ where: { studentId, hypotheticalGrade: { not: null } }, select: { hypotheticalGrade: true, course: { select: { code: true } } } }),
  ]);
  const plannedByCode = new Map(plan.map((p) => [p.course.code.trim().toUpperCase(), p.hypotheticalGrade!]));
  const frozen = await frozenPlans(studentId);
  return records.map((r) => {
    const f = frozen.get(`${r.courseCode.trim().toUpperCase()}|${r.termName}|${r.termYear}`);
    return { ...r, planned: f || plannedByCode.get(r.courseCode.trim().toUpperCase()) || null, frozen: !!f };
  }).filter((r) => r.planned);
}

/* ---------------- Planned grades frozen at the start of the semester ---------------- */

const gdb = prisma as unknown as Record<string, any>;

/** Keep the target grade of each course the student is now taking, as it stood when they were registered. Existing
 * snapshots are never overwritten, so later what-if changes don't rewrite what was planned. */
export async function freezePlannedGrades(studentId: string) {
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { course: { select: { code: true, offeredTermName: true, offeredTermYear: true } } } });
  const plan = await prisma.degreePlanEntry.findMany({ where: { studentId, hypotheticalGrade: { not: null } }, select: { hypotheticalGrade: true, course: { select: { code: true } } } });
  const byCode = new Map(plan.map((p) => [p.course.code.trim().toUpperCase(), p.hypotheticalGrade!]));
  let n = 0;
  for (const { course } of enr) {
    const g = byCode.get(course.code.trim().toUpperCase());
    if (!g || !course.offeredTermName || !course.offeredTermYear) continue;
    try {
      const exists = await gdb.gradePlanSnapshot.findFirst({ where: { studentId, courseCode: course.code, termName: course.offeredTermName, termYear: course.offeredTermYear } });
      if (exists) continue;
      await gdb.gradePlanSnapshot.create({ data: { id: `${studentId}-${course.code}-${course.offeredTermName}-${course.offeredTermYear}`.slice(0, 190), studentId, courseCode: course.code, termName: course.offeredTermName, termYear: course.offeredTermYear, plannedGrade: g, createdAt: new Date() } });
      n++;
    } catch { return n; } // table not there yet
  }
  return n;
}

export async function frozenPlans(studentId: string): Promise<Map<string, string>> {
  try {
    const rows = (await gdb.gradePlanSnapshot.findMany({ where: { studentId } })) as { courseCode: string; termName: string; termYear: number; plannedGrade: string }[];
    return new Map(rows.map((r) => [`${r.courseCode.trim().toUpperCase()}|${r.termName}|${r.termYear}`, r.plannedGrade]));
  } catch { return new Map(); }
}
