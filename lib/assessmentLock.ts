import { prisma } from "./db";
import { usableBestOf, PLAN_SELECT, planFor } from "./assessmentWeights";

/** Quiz / Assignment types whose per-item weight is fixed because "best K of N" applies. Returns the type and its per-item weight. */
export async function lockedWeights(courseId: string, source: "SE" | "INSTRUCTOR", extraCount: Record<string, number> = {}): Promise<Map<string, number>> {
  const [course, items] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: PLAN_SELECT }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source, type: { in: ["Quiz", "Assignment"] } }, select: { type: true } }),
  ]);
  const out = new Map<string, number>();
  if (!course) return out;
  // The Instructor's own counts / best-of / percentages apply to their items (the Subject Expert's plan until they set them).
  const plan = planFor(course, source);
  for (const [type, k, target] of [["Quiz", plan.quizBestOf, plan.quizPct], ["Assignment", plan.assignmentBestOf, plan.assignmentPct]] as [string, number | null, number | null][]) {
    const count = items.filter((i: { type: string }) => i.type === type).length + (extraCount[type] || 0);
    const use = usableBestOf(k, count);
    if (use && target) out.set(type, Math.round((target / use) * 10000) / 10000);
  }
  return out;
}

/** Quizzes/assignments can't exceed the number defined on the Assessment Weights page. Returns the limit when already reached, else null. */
export async function reachedDefinedCount(courseId: string, source: "SE" | "INSTRUCTOR", type: string): Promise<number | null> {
  if (type !== "Quiz" && type !== "Assignment") return null;
  const plan = planFor(await prisma.course.findUnique({ where: { id: courseId }, select: PLAN_SELECT }), source);
  const limit = type === "Quiz" ? plan.quizCount : plan.assignmentCount;
  if (!limit || limit <= 0) return null;
  const have = await prisma.assessmentInstrument.count({ where: { courseId, source, type } });
  return have >= limit ? limit : null;
}
