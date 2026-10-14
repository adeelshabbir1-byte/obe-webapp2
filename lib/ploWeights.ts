import { prisma } from "./db";
import { equalWeights, suggestedWeights, courseFamily, type WeightCourse } from "./ploWeightMath";

export const wdb = prisma as unknown as Record<string, any>;
type Row = { courseId: string; ploId: string; weightPct: number; source: string };

/** Per PLO of a batch: the courses the OMC mapped to it, their saved weights (else an equal split), and the suggestion. */
export async function batchPloWeights(batchId: string, withAttainment = false) {
  const [plos, maps] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }),
    prisma.coursePloMapping.findMany({ where: { plo: { batchId } }, select: { ploId: true, course: { select: { id: true, code: true, title: true, courseType: true, creditHours: true, semesterNumber: true } } } }),
  ]);
  let saved: Row[] = [], missing = false;
  try { saved = (await wdb.coursePloWeight.findMany({ where: { batchId } })) as Row[]; } catch { missing = true; }

  // Students reaching each PLO in each course (only courses with marks), for the weighted batch attainment.
  const att = new Map<string, Record<string, number>>();
  if (withAttainment) {
    const ids = Array.from(new Set(maps.map((m) => m.course.id)));
    const marked = new Set((await prisma.studentMark.groupBy({ by: ["courseId"], where: { courseId: { in: ids } } })).map((g) => g.courseId));
    const { computeCloPloPassRates } = await import("./resultMate");
    for (const id of Array.from(marked)) {
      const r = await computeCloPloPassRates(id).catch(() => null);
      if (r && r.studentCount) att.set(id, Object.fromEntries(r.ploStats.filter((s) => s.maxWeight > 0).map((s) => [s.label, Math.round((1000 * s.passCount) / r.studentCount) / 10])));
    }
  }

  return {
    missing,
    plos: plos.map((p) => {
      const courses = maps.filter((m) => m.ploId === p.id).map((m) => m.course).sort((a, b) => (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99) || a.code.localeCompare(b.code));
      const wc: WeightCourse[] = courses.map((c) => ({ id: c.id, courseType: c.courseType, creditHours: c.creditHours }));
      const mine = saved.filter((s) => s.ploId === p.id && courses.some((c) => c.id === s.courseId));
      const complete = mine.length === courses.length && courses.length > 0;
      const weights = complete ? Object.fromEntries(mine.map((s) => [s.courseId, s.weightPct])) : equalWeights(wc);
      return {
        id: p.id, number: p.number, title: p.title,
        state: complete ? (mine.every((s) => s.source === "SUGGESTED") ? "SUGGESTED" : "SET") : "EQUAL",
        courses: courses.map((c) => ({ ...c, family: courseFamily(c.courseType), weight: weights[c.id], attainment: att.get(c.id)?.[`PLO-${p.number}`] ?? null })),
        equal: equalWeights(wc), suggested: suggestedWeights(wc, p.number),
      };
    }),
  };
}
