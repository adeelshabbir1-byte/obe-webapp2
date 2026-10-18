import { prisma } from "./db";
import { instituteTerm, termLabel as termText } from "./assignerHat";
import { statusOf } from "./deadlines";

// Recognition layer: a private OBE checklist per teacher (how complete each of their courses is), semester badges given
// for good practice (never penalties), and department goals everyone can see. It reads data the system already keeps.

export const rdb2 = prisma as unknown as Record<string, any>;
export type BadgeRow = { id: string; chairmanId: string; userId: string; term: string; badgeKey: string; title: string; reason: string | null; awardedById: string | null; createdAt: Date };
export type GoalRow = { id: string; chairmanId: string; departmentId: string | null; title: string; metric: string; targetPct: number; dueDate: Date; createdById: string; createdAt: Date };

export const BADGES: Record<string, { title: string; icon: string; rule: string }> = {
  OBE_CHAMPION: { title: "OBE Champion", icon: "🏆", rule: "Every course you taught this semester is complete: CLOs mapped to GAs, assessments linked to CLOs, all marks in, result approved, CQI done where needed, course file kept." },
  ALWAYS_ON_TIME: { title: "Always On Time", icon: "⏱️", rule: "Every one of your deadlines this semester (at least 3) was met on time." },
  CQI_CLOSER: { title: "CQI Closer", icon: "🔁", rule: "Every CLO of your courses that fell below its target has a CQI action written down." },
  COURSE_FILE_COMPLETE: { title: "Course File Complete", icon: "📁", rule: "The course file of every course you taught this semester is complete and kept." },
};
export const METRICS: Record<string, string> = {
  COURSE_FILES: "Course files kept", RESULTS_APPROVED: "Course results approved", CLOS_MAPPED: "Courses with every CLO mapped to a GA",
  MARKS_COMPLETE: "Courses with all marks entered", CQI_DONE: "Courses with CQI done where CLOs fell short",
};
export const RECOGNITION_MANAGERS = ["CHAIRMAN", "HEAD_OF_DEPARTMENT"];

/** The institute's current semester and its date window (Fall: Aug–Jan, Spring: Feb–Jul). */
export async function currentSemester(chairmanId: string) {
  const t = await instituteTerm(chairmanId);
  if (!t) return null;
  const from = t.termName === "Fall" ? new Date(Date.UTC(t.year, 7, 1)) : new Date(Date.UTC(t.year, 1, 1));
  const to = t.termName === "Fall" ? new Date(Date.UTC(t.year + 1, 1, 1)) : new Date(Date.UTC(t.year, 7, 1));
  return { label: termText(t), termName: t.termName, year: t.year, from, to };
}

export type CourseCheck = { id: string; code: string; title: string; batch: string; steps: { key: string; label: string; done: boolean | null; note?: string }[]; pct: number };

/** The OBE checklist for each course a teacher teaches this semester. null = not applicable (e.g. no CLO fell short). */
export async function courseChecklist(courseIds: string[]): Promise<CourseCheck[]> {
  if (!courseIds.length) return [];
  const [courses, clos, insts, links, enrol, marks, results, folders, cqi] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } }),
    prisma.cLO.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, source: true, mappedPloId: true, code: true, targetPct: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: courseIds }, source: "INSTRUCTOR" }, select: { id: true, courseId: true } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId: { in: courseIds }, source: "INSTRUCTOR" } }, select: { instrumentId: true } }),
    prisma.studentEnrollment.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds }, status: { not: "WITHDRAWN" } }, _count: { _all: true } }),
    prisma.studentMark.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
    rdb2.courseResult.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, status: true } }).catch(() => []) as Promise<{ courseId: string; status: string }[]>,
    prisma.courseFolder.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, kept: true } }),
    prisma.cqiRecord.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, actionTaken: true, status: true } }),
  ]);
  const linked = new Set(links.map((l) => l.instrumentId));
  const { computeCloPloPassRates } = await import("./resultMate");
  const out: CourseCheck[] = [];
  for (const c of courses) {
    const own = clos.filter((x) => x.courseId === c.id && x.source === "INSTRUCTOR");
    const cl = own.length ? own : clos.filter((x) => x.courseId === c.id && x.source === "SE");
    const ins = insts.filter((i) => i.courseId === c.id);
    const students = enrol.find((e) => e.courseId === c.id)?._count._all || 0;
    const markCount = marks.find((m) => m.courseId === c.id)?._count._all || 0;
    const approved = results.find((r) => r.courseId === c.id)?.status === "APPROVED";
    // CQI is only judged once the result is approved (marks are final): CLOs below their own target need an action.
    let cqiDone: boolean | null = null, cqiNote = "";
    if (approved) {
      const r = await computeCloPloPassRates(c.id).catch(() => null);
      const low = r && r.studentCount ? r.cloStats.filter((s) => s.maxWeight > 0 && (100 * s.passCount) / r.studentCount < (cl.find((x) => x.code === s.code)?.targetPct ?? 60)).map((s) => s.code) : [];
      if (low.length) {
        const acted = cqi.filter((q) => q.courseId === c.id && (q.actionTaken || "").trim() && q.status !== "open");
        cqiDone = acted.length > 0; cqiNote = `${low.join(", ")} below target`;
      }
    }
    const steps = [
      { key: "clos", label: "Every CLO mapped to a GA", done: cl.length > 0 && cl.every((x) => !!x.mappedPloId) },
      { key: "assess", label: "Every assessment linked to the CLOs it tests", done: ins.length > 0 && ins.every((i) => linked.has(i.id)) },
      { key: "marks", label: "All marks entered", done: students > 0 && ins.length > 0 && markCount >= students * ins.length, note: students && ins.length ? `${Math.min(100, Math.round((100 * markCount) / (students * ins.length)))}%` : undefined },
      { key: "result", label: "Result approved", done: approved },
      { key: "cqi", label: "CQI action for CLOs below target", done: cqiDone, note: cqiNote || (approved ? "no CLO fell short" : "checked once the result is approved") },
      { key: "file", label: "Course file kept", done: !!folders.find((f) => f.courseId === c.id)?.kept },
    ];
    const judged = steps.filter((s) => s.done !== null);
    out.push({ id: c.id, code: c.code, title: c.title, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", steps, pct: judged.length ? Math.round((100 * judged.filter((s) => s.done).length) / judged.length) : 0 });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** One teacher's semester: their courses' checklist and which automatic badges they have earned so far. */
export async function teacherSemester(userId: string, chairmanId: string) {
  const sem = await currentSemester(chairmanId);
  const courses = sem ? await prisma.course.findMany({ where: { instructorId: userId, isOffered: true, offeredTermName: sem.termName, offeredTermYear: sem.year }, select: { id: true } }) : [];
  const checks = await courseChecklist(courses.map((c) => c.id));
  // Deadlines this semester that belong to the teacher (named, or as Instructor of their courses).
  const dls = sem ? ((await prisma.deadline.findMany({
    where: { allCourses: false, dueDate: { gte: sem.from, lt: sem.to }, OR: [{ assigneeId: userId }, { courseId: { in: courses.map((c) => c.id).concat(["none"]) }, role: "INSTRUCTOR" }] } as never,
    select: { dueDate: true, completedAt: true },
  })) as unknown as { dueDate: Date; completedAt: Date | null }[]) : [];
  const st = dls.map((d) => statusOf(d));
  const judged = st.filter((s) => s === "ON_TIME" || s === "LATE_DONE" || s === "OVERDUE");
  const cqiApplies = checks.filter((c) => c.steps.find((s) => s.key === "cqi")?.done !== null);
  const earned: { key: string; met: boolean; why: string }[] = [
    { key: "OBE_CHAMPION", met: checks.length > 0 && checks.every((c) => c.steps.every((s) => s.done !== false)), why: checks.length ? `${checks.filter((c) => c.steps.every((s) => s.done !== false)).length} of ${checks.length} courses complete` : "no course this semester" },
    { key: "ALWAYS_ON_TIME", met: judged.length >= 3 && judged.every((s) => s === "ON_TIME"), why: judged.length ? `${judged.filter((s) => s === "ON_TIME").length} of ${judged.length} deadlines on time` : "no deadlines due yet" },
    { key: "CQI_CLOSER", met: cqiApplies.length > 0 && cqiApplies.every((c) => c.steps.find((s) => s.key === "cqi")?.done), why: cqiApplies.length ? `${cqiApplies.filter((c) => c.steps.find((s) => s.key === "cqi")?.done).length} of ${cqiApplies.length} courses with CLOs below target have a CQI action` : "no CLO below target (yet)" },
    { key: "COURSE_FILE_COMPLETE", met: checks.length > 0 && checks.every((c) => c.steps.find((s) => s.key === "file")?.done), why: `${checks.filter((c) => c.steps.find((s) => s.key === "file")?.done).length} of ${checks.length} course files kept` },
  ];
  const pct = checks.length ? Math.round(checks.reduce((n, c) => n + c.pct, 0) / checks.length) : null;
  return { sem, checks, earned, pct, deadlines: { judged: judged.length, onTime: st.filter((s) => s === "ON_TIME").length, upcoming: st.filter((s) => s === "SOON" || s === "UPCOMING").length } };
}

/** Progress of a goal over the offered courses of this semester (in the goal's department, or the whole institute). */
export async function goalProgress(g: GoalRow) {
  const sem = await currentSemester(g.chairmanId);
  if (!sem) return { done: 0, total: 0, pct: 0 };
  const courses = await prisma.course.findMany({
    where: { isOffered: true, offeredTermName: sem.termName, offeredTermYear: sem.year, instructorId: { not: null }, coordinator: { managedById: g.chairmanId, ...(g.departmentId ? { departmentId: g.departmentId } : {}) } },
    select: { id: true }, take: 2000,
  });
  const ids = courses.map((c) => c.id);
  if (!ids.length) return { done: 0, total: 0, pct: 0 };
  let done = 0;
  if (g.metric === "COURSE_FILES") done = await prisma.courseFolder.count({ where: { courseId: { in: ids }, kept: true } });
  else if (g.metric === "RESULTS_APPROVED") done = await rdb2.courseResult.count({ where: { courseId: { in: ids }, status: "APPROVED" } }).catch(() => 0);
  else {
    const checks = await courseChecklist(ids);
    const key = g.metric === "CLOS_MAPPED" ? "clos" : g.metric === "MARKS_COMPLETE" ? "marks" : "cqi";
    done = checks.filter((c) => c.steps.find((s) => s.key === key)?.done !== false).length;
  }
  return { done, total: ids.length, pct: Math.round((100 * done) / ids.length) };
}

export async function goalsFor(chairmanId: string, departmentId: string | null) {
  try {
    const rows = (await rdb2.recognitionGoal.findMany({ where: { chairmanId, OR: [{ departmentId: null }, ...(departmentId ? [{ departmentId }] : [])] }, orderBy: { dueDate: "asc" } })) as GoalRow[];
    return await Promise.all(rows.map(async (g) => ({ g, p: await goalProgress(g) })));
  } catch { return []; }
}
