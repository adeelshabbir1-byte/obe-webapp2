import { prisma } from "./db";
import { usableBestOf } from "./assessmentWeights";

/** Quiz / Assignment types whose per-item weight is fixed because "best K of N" applies. Returns the type and its per-item weight. */
export async function lockedWeights(courseId: string, source: "SE" | "INSTRUCTOR", extraCount: Record<string, number> = {}): Promise<Map<string, number>> {
  const [course, items] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { quizBestOf: true, quizPct: true, assignmentBestOf: true, assignmentPct: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source, type: { in: ["Quiz", "Assignment"] } }, select: { type: true } }),
  ]);
  const out = new Map<string, number>();
  if (!course) return out;
  for (const [type, k, target] of [["Quiz", course.quizBestOf, course.quizPct], ["Assignment", course.assignmentBestOf, course.assignmentPct]] as [string, number | null, number][]) {
    const count = items.filter((i: { type: string }) => i.type === type).length + (extraCount[type] || 0);
    const use = usableBestOf(k, count);
    if (use && target) out.set(type, Math.round((target / use) * 10000) / 10000);
  }
  return out;
}
