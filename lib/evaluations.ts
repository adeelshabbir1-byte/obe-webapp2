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
      for (const [key] of EVAL[k].items) { const v = rs.map((r) => Number((JSON.parse(r.answersJson) as Record<string, number>)[key])).filter((x) => x > 0); if (v.length) avg[key] = Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10; }
      const vals = Object.values(avg);
      return { n: rs.length, avg, overall: vals.length ? Math.round((10 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 10 : null, comments: rs.map((r) => r.comment).filter((c): c is string => !!c) };
    };
    out.set(id, { COURSE: per("COURSE"), TEACHER: per("TEACHER") });
  }
  return out;
}
