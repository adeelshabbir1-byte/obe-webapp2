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

/** Quizzes/assignments can't exceed the number defined on the Assessment Weights page. Returns the limit when already reached, else null. */
export async function reachedDefinedCount(courseId: string, source: "SE" | "INSTRUCTOR", type: string): Promise<number | null> {
  if (type !== "Quiz" && type !== "Assignment") return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { quizCount: true, assignmentCount: true } });
  const limit = type === "Quiz" ? course?.quizCount : course?.assignmentCount;
  if (!limit || limit <= 0) return null;
  const have = await prisma.assessmentInstrument.count({ where: { courseId, source, type } });
  return have >= limit ? limit : null;
}
