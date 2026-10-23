import { prisma } from "./db";
export const evdb = prisma as unknown as Record<string, any>;

// End-of-course evaluations by students (the HEC QEC course and teacher evaluation pattern), rated 1-5.
export const EVAL: Record<"COURSE" | "TEACHER", { title: string; items: [string, string][] }> = {
  COURSE: { title: "Course evaluation", items: [
    ["objectives", "The course objectives and outcomes were clear"], ["content", "The course content was well organised and up to date"], ["workload", "The workload was appropriate for the credit hours"],
    ["assessment", "Assessments matched what was taught"], ["feedback", "Marked work was returned with useful feedback"], ["resources", "Books, notes and online material were adequate"],
    ["labs", "Labs / practical work supported the theory (if any)"], ["skills", "The course improved my knowledge and skills"], ["overall", "Overall, I am satisfied with this course"]] },
  TEACHER: { title: "Teacher evaluation", items: [
    ["prepared", "The teacher came prepared for class"], ["clear", "The teacher explained concepts clearly"], ["punctual", "The teacher was punctual and took classes regularly"],
    ["engaged", "The teacher encouraged questions and participation"], ["fair", "The teacher was fair in assessment and grading"], ["available", "The teacher was available outside class (office hours)"],
    ["respect", "The teacher treated students with respect"], ["covered", "The teacher covered the whole course outline"], ["overall", "Overall, I would rate this teacher highly"]] },
};
export const MIN_RESPONSES = 5; // results are shown to the teacher only when at least this many students answered

export async function evalSummary(courseIds: string[]) {
  const rows = (await evdb.courseEvaluation.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, kind: true, answersJson: true, comment: true } }).catch(() => [])) as { courseId: string; kind: "COURSE" | "TEACHER"; answersJson: string; comment: string | null }[];
  const out = new Map<string, { COURSE: { n: number; avg: Record<string, number>; overall: number | null; comments: string[] }; TEACHER: { n: number; avg: Record<string, number>; overall: number | null; comments: string[] } }>();
  for (const id of courseIds) {
    const per = (k: "COURSE" | "TEACHER") => {
      const rs = rows.filter((r) => r.courseId === id && r.kind === k); const avg: Record<string, number> = {};
      const keys = Array.from(new Set([...EVAL[k].items.map(([key]) => key), ...rs.flatMap((r) => { try { return Object.keys(JSON.parse(r.answersJson)); } catch { return []; } })]));
      for (const key of keys) { const v = rs.map((r) => { try { return Number((JSON.parse(r.answersJson) as Record<string, number>)[key]); } catch { return 0; } }).filter((x) => x > 0); if (v.length) avg[key] = Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10; }
      const vals = Object.values(avg);
      return { n: rs.length, avg, overall: vals.length ? Math.round((10 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 10 : null, comments: rs.map((r) => r.comment).filter((c): c is string => !!c) };
    };
    out.set(id, { COURSE: per("COURSE"), TEACHER: per("TEACHER") });
  }
  return out;
}

/** Teacher evaluations split by teacher. When several teachers taught sections of a course, each student's answer goes
 * to the teacher who marked most of that student's attendance (the teacher of their section). */
/** Who taught each student of these courses: the only teacher, or — when sections are shared — the teacher who marked
 * most of that student's attendance. "?" when it can't be told. */
export async function sectionTeachers(courseIds: string[]) {
  const ids = courseIds.concat(["none"]);
  const courses = await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, instructorId: true, sectionAssignments: { select: { instructorId: true } } } });
  const teachersOf = new Map(courses.map((c) => [c.id, Array.from(new Set([...c.sectionAssignments.map((a) => a.instructorId), ...(c.instructorId ? [c.instructorId] : [])]))]));
  const shared = courses.filter((c) => (teachersOf.get(c.id) || []).length > 1).map((c) => c.id);
  const marks = shared.length ? await prisma.attendanceRecord.groupBy({ by: ["courseId", "studentId", "markedById"], where: { courseId: { in: shared } }, _count: { _all: true } }).catch(() => []) : [];
  const sectionTeacher = new Map<string, string>(), best = new Map<string, number>();
  for (const m of marks) {
    if (!(teachersOf.get(m.courseId) || []).includes(m.markedById)) continue;
    const k = `${m.courseId}|${m.studentId}`;
    if (m._count._all > (best.get(k) || 0)) { best.set(k, m._count._all); sectionTeacher.set(k, m.markedById); }
  }
  return { teachersOf, teacherOf: (courseId: string, studentId: string) => { const ts = teachersOf.get(courseId) || []; return ts.length === 1 ? ts[0] : sectionTeacher.get(`${courseId}|${studentId}`) || "?"; } };
}

export async function teacherRatings(courseIds: string[], minResponses = MIN_RESPONSES) {
  const ids = courseIds.concat(["none"]);
  const [rows, sec] = await Promise.all([
    evdb.courseEvaluation.findMany({ where: { courseId: { in: ids }, kind: "TEACHER" }, select: { courseId: true, studentId: true, answersJson: true } }).catch(() => []) as Promise<{ courseId: string; studentId: string; answersJson: string }[]>,
    sectionTeachers(courseIds),
  ]);
  const sum = new Map<string, { t: number; n: number }>(); // courseId|teacherId (teacherId "?" = can't tell)
  for (const r of rows) {
    const who = sec.teacherOf(r.courseId, r.studentId);
    let a: Record<string, number> = {};
    try { a = JSON.parse(r.answersJson); } catch { continue; }
    const v = Object.values(a).map(Number).filter((x) => x > 0 && x <= 5);
    if (!v.length) continue;
    const k = `${r.courseId}|${who}`, cur = sum.get(k) || { t: 0, n: 0 };
    cur.t += v.reduce((x, y) => x + y, 0) / v.length; cur.n++; sum.set(k, cur);
  }
  const out = new Map<string, { teacherId: string; n: number; overall: number | null }[]>();
  for (const [k, { t, n }] of Array.from(sum.entries())) {
    const [courseId, teacherId] = k.split("|");
    if (!out.has(courseId)) out.set(courseId, []);
    out.get(courseId)!.push({ teacherId, n, overall: n >= minResponses ? Math.round((10 * t) / n) / 10 : null });
  }
  return out;
}
