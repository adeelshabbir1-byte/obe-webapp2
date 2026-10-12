import { prisma } from "./db";
import { KIND_ROLE, statusOf } from "./deadlines";

// Faculty annual appraisal: one year's figures for one teacher, pulled from what the system already records —
// teaching load, lecture delivery, results, deadlines, course design, CLO attainment, profile (publications etc.),
// invigilation. "deep" adds the slower checks (Planned vs Taught and CLO pass rates per course).

export const adb = prisma as unknown as Record<string, any>;
export type AppraisalRow = {
  id: string; userId: string; year: number; chairmanId: string; reviewerId: string | null; status: string; ratingsJson: string;
  studentFeedback: number | null; overall: string | null; strengths: string | null; improve: string | null; goals: string | null;
  metricsJson: string | null; facultyComment: string | null; acknowledgedAt: Date | null; updatedAt: Date;
};
export const OVERALL: Record<string, string> = { OUTSTANDING: "Outstanding", VERY_GOOD: "Very good", GOOD: "Good", NEEDS_IMPROVEMENT: "Needs improvement", UNSATISFACTORY: "Unsatisfactory" };
export const RATING_AREAS: [string, string][] = [["teaching", "Teaching quality"], ["research", "Research & development"], ["service", "Service & administration"], ["conduct", "Professional conduct"]];
export const REVIEWER_ROLES = ["CHAIRMAN", "HEAD_OF_DEPARTMENT"];
export const APPRAISAL_VIEW_ROLES = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"];

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);

export type Scorecard = Awaited<ReturnType<typeof computeScorecard>>;

export async function computeScorecard(userId: string, year: number, opts: { deep?: boolean } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, department_: { select: { name: true } }, managedById: true } });
  const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year + 1, 0, 1));
  const [teaching, seCourses, snaps, records, deadlinesNamed] = await Promise.all([
    prisma.course.findMany({ where: { instructorId: userId, offeredTermYear: year }, select: { id: true, code: true, title: true, creditHours: true, offeredTermName: true, offeredTermYear: true, batch: { select: { batchName: true, degreeProgram: true } }, _count: { select: { studentEnrollments: true } } } }),
    prisma.course.findMany({ where: { subjectExpertId: userId }, select: { id: true, code: true, title: true, templateStatus: true, seResponse: true } }),
    user ? prisma.assignmentSnapshot.findMany({ where: { instructorName: user.name, termYear: year }, select: { courseLabel: true, termName: true, termYear: true, batchLabel: true } }) : Promise.resolve([]),
    prisma.facultyRecord.findMany({ where: { userId }, select: { kind: true, startYear: true, endYear: true } }),
    prisma.deadline.findMany({ where: { assigneeId: userId, allCourses: false, dueDate: { gte: from, lt: to } } as never, select: { dueDate: true, completedAt: true } }) as unknown as Promise<{ dueDate: Date; completedAt: Date | null }[]>,
  ]);
  const ids = teaching.map((c) => c.id);

  // Deadlines that belong to this teacher through their courses' roles (Instructor of the courses taught, SE of the courses built).
  const roleCourseIds = Array.from(new Set([...ids, ...seCourses.map((c) => c.id)]));
  const courseDeadlines = roleCourseIds.length ? ((await prisma.deadline.findMany({ where: { courseId: { in: roleCourseIds }, allCourses: false, dueDate: { gte: from, lt: to } } as never, select: { dueDate: true, completedAt: true, courseId: true, role: true, kind: true } })) as unknown as { dueDate: Date; completedAt: Date | null; courseId: string; role: string | null; kind: string }[]) : [];
  const mineByRole = courseDeadlines.filter((d) => { const r = d.role || KIND_ROLE[d.kind]; return r === "INSTRUCTOR" ? ids.includes(d.courseId) : r === "SUBJECT_EXPERT" ? seCourses.some((c) => c.id === d.courseId) : false; });
  const dl: Record<"ON_TIME" | "LATE_DONE" | "OVERDUE" | "SOON" | "UPCOMING", number> = { ON_TIME: 0, LATE_DONE: 0, OVERDUE: 0, SOON: 0, UPCOMING: 0 };
  for (const d of [...deadlinesNamed, ...mineByRole]) dl[statusOf(d)]++;
  const judged = dl.ON_TIME + dl.LATE_DONE + dl.OVERDUE;

  // Delivery and attendance.
  const [lectures, attendance, results, changes, instruments, rubrics] = await Promise.all([
    ids.length ? prisma.lectureRow.findMany({ where: { courseId: { in: ids }, source: "INSTRUCTOR" }, select: { courseId: true, actualDate: true, topic: true } }) : Promise.resolve([]),
    ids.length ? (prisma.attendanceRecord.groupBy({ by: ["courseId", "lectureRowId"], where: { courseId: { in: ids } } } as never) as unknown as Promise<{ courseId: string }[]>) : Promise.resolve([]),
    ids.length ? adb.courseResult.findMany({ where: { courseId: { in: ids } } }).catch(() => []) as Promise<{ courseId: string; status: string }[]> : Promise.resolve([]),
    adb.gradeChangeRequest.findMany({ where: { requestedById: userId, createdAt: { gte: from, lt: to } } }).catch(() => []) as Promise<{ status: string }[]>,
    ids.length ? prisma.assessmentInstrument.findMany({ where: { courseId: { in: ids }, source: "INSTRUCTOR", type: { in: ["Assignment", "Project", "Lab"] } }, select: { id: true } }) : Promise.resolve([]),
    ids.length ? adb.rubric.findMany({ where: { courseId: { in: ids } }, select: { instrumentId: true } }).catch(() => []) as Promise<{ instrumentId: string }[]> : Promise.resolve([]),
  ]);
  const teachingLectures = lectures.filter((l) => (l.topic || "").trim());
  const delivered = teachingLectures.filter((l) => l.actualDate).length;
  const rubricSet = new Set(rubrics.map((r) => r.instrumentId));

  // Invigilation duties in exam sessions of the year.
  let invigilations = 0;
  try {
    const sessions = (await adb.examSession.findMany({ where: { startDate: { gte: from, lt: to }, status: "PUBLISHED" }, select: { id: true } })) as { id: string }[];
    if (sessions.length) {
      const papers = (await adb.examPaper.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) } }, select: { date: true, slot: true, invigilatorsJson: true } })) as { date: Date | null; slot: number | null; invigilatorsJson: string }[];
      const seen = new Set<string>();
      for (const p of papers) { let inv: { roomId: string; userIds: string[] }[] = []; try { inv = JSON.parse(p.invigilatorsJson || "[]"); } catch { inv = []; } for (const r of inv) if (r.userIds.includes(userId)) seen.add(`${p.date}|${p.slot}|${r.roomId}`); }
      invigilations = seen.size;
    }
  } catch { /* exam tables not created yet */ }

  // Slower checks: how the teaching matched the plan, and how many students reached each CLO.
  let balance: number | null = null, coverage: number | null = null, flagged: string[] = [], cloPass: number | null = null;
  if (opts.deep && ids.length) {
    const { analyzeTeaching } = await import("./teachingAnalysis");
    const { computeCloPloPassRates } = await import("./resultMate");
    const bal: number[] = [], cov: number[] = [], clo: number[] = [];
    for (const c of teaching) {
      const a = await analyzeTeaching(c.id).catch(() => null);
      if (a && a.ins.alignment !== null) bal.push(a.ins.alignment);
      if (a) {
        const se = a.topics.filter((t) => t.se);
        if (se.length) cov.push(Math.round((100 * se.filter((t) => t.status === "covered" || t.status === "partial").length) / se.length));
        if (a.topics.filter((t) => t.insFlags.some((f) => f.kind === "under" || f.kind === "unassessed")).length >= 2) flagged.push(c.code);
      }
      const r = await computeCloPloPassRates(c.id).catch(() => null);
      if (r && r.studentCount) for (const s of r.cloStats) if (s.maxWeight > 0) clo.push((100 * s.passCount) / r.studentCount);
    }
    const avg = (x: number[]) => (x.length ? Math.round(x.reduce((a, b) => a + b, 0) / x.length) : null);
    balance = avg(bal); coverage = avg(cov); cloPass = avg(clo);
  }

  const inYear = (r: { startYear: number | null; endYear: number | null }) => r.startYear === year || r.endYear === year;
  const dev = {
    publications: records.filter((r) => r.kind === "PUBLICATION" && inYear(r)).length,
    grants: records.filter((r) => r.kind === "GRANT" && inYear(r)).length,
    projects: records.filter((r) => r.kind === "PROJECT" && inYear(r)).length,
    events: records.filter((r) => r.kind === "EVENT" && inYear(r)).length,
    profileSections: Array.from(new Set(records.map((r) => r.kind))).length,
  };
  const res = {
    approved: results.filter((r) => r.status === "APPROVED").length, submitted: results.filter((r) => r.status === "SUBMITTED").length,
    returned: results.filter((r) => r.status === "RETURNED").length, notSubmitted: ids.length - results.filter((r) => ["APPROVED", "SUBMITTED"].includes(r.status)).length,
    gradeChanges: changes.length, gradeChangesApproved: changes.filter((c) => c.status === "APPROVED" || c.status === "APPLIED").length,
    rubricCoverage: pct(instruments.filter((i) => rubricSet.has(i.id)).length, instruments.length),
  };
  const design = {
    courses: seCourses.length, approved: seCourses.filter((c) => c.templateStatus === "approved").length,
    submitted: seCourses.filter((c) => c.templateStatus === "submitted").length,
    draft: seCourses.filter((c) => ["draft", "changes-requested", "reopened"].includes(c.templateStatus)).length,
  };
  const indicators = [
    { key: "ontime", label: "Deadlines met on time", value: judged ? `${pct(dl.ON_TIME, judged)}% (${dl.ON_TIME} of ${judged})` : "no deadlines due", score: pct(dl.ON_TIME, judged) },
    { key: "delivery", label: "Planned lectures delivered", value: teachingLectures.length ? `${pct(delivered, teachingLectures.length)}% (${delivered} of ${teachingLectures.length})` : "—", score: pct(delivered, teachingLectures.length) },
    { key: "coverage", label: "Planned topics taught (Planned vs Taught)", value: coverage !== null ? `${coverage}%` : opts.deep ? "—" : "open the scorecard", score: coverage },
    { key: "balance", label: "Teaching–assessment balance", value: balance !== null ? `${balance}/100` : opts.deep ? "—" : "open the scorecard", score: balance },
    { key: "clo", label: "Students reaching each CLO (average)", value: cloPass !== null ? `${cloPass}%` : opts.deep ? "—" : "open the scorecard", score: cloPass },
    { key: "results", label: "Course results approved", value: ids.length ? `${res.approved} of ${ids.length}` : "—", score: pct(res.approved, ids.length) },
    { key: "rubrics", label: "Assignments / projects / labs with a rubric", value: res.rubricCoverage !== null ? `${res.rubricCoverage}%` : "—", score: res.rubricCoverage },
  ];
  const scored = indicators.filter((i) => i.score !== null) as { score: number }[];
  return {
    teacher: { id: userId, name: user?.name || "—", department: user?.department_?.name || null }, year,
    load: {
      courses: teaching.map((c) => ({ code: c.code, title: c.title, term: `${c.offeredTermName || ""} ${c.offeredTermYear || ""}`.trim(), batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", students: c._count.studentEnrollments, creditHours: c.creditHours })),
      earlier: snaps.map((s) => `${s.courseLabel} (${s.termName} ${s.termYear})`),
      creditHours: teaching.reduce((n, c) => n + c.creditHours, 0), students: teaching.reduce((n, c) => n + c._count.studentEnrollments, 0),
    },
    delivery: { planned: teachingLectures.length, delivered, attendanceSessions: attendance.length, flagged },
    deadlines: { ...dl, judged, rate: pct(dl.ON_TIME, judged) },
    results: res, design, development: dev, service: { invigilations },
    indicators, systemScore: scored.length ? Math.round(scored.reduce((n, i) => n + i.score, 0) / scored.length) : null,
  };
}

/** Teaching staff a reviewer appraises: the Institute Head sees everyone; a Chairman (HoD) their department; a Dean their faculty. */
export async function appraiseesFor(user: { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null }) {
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  const leads = await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" as never }, select: { id: true } });
  const scope = user.role === "HEAD_OF_DEPARTMENT" ? { departmentId: user.departmentId || "none" } : user.role === "DEAN" ? { department_: { facultyId: user.facultyId || "none" } } : {};
  const people = await prisma.user.findMany({
    where: { isActive: true, isVisitingPlaceholder: false, managedById: { in: [chairmanId, ...leads.map((l) => l.id)] }, OR: [{ role: "INSTRUCTOR" }, { secondaryRole: "INSTRUCTOR" }, { tertiaryRole: "INSTRUCTOR" }, { role: "SUBJECT_EXPERT" }], ...scope } as never,
    select: { id: true, name: true, department_: { select: { name: true } } }, orderBy: { name: "asc" },
  });
  return { chairmanId, people: people.map((p) => ({ id: p.id, name: p.name, department: p.department_?.name || null })) };
}
