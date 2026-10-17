import { prisma } from "./db";
import { PLAN_SELECT, planFor, effectiveSum } from "./assessmentWeights";

const TARGET: Record<string, "quizPct" | "assignmentPct" | "midtermPct" | "finalPct" | "projectPct" | "labPct"> = { Quiz: "quizPct", Assignment: "assignmentPct", Midterm: "midtermPct", Final: "finalPct", Project: "projectPct", Lab: "labPct" };

/**
 * Refuses a change that pushes an assessment type above its own target (or the course above 100%). Lowering marks is
 * always allowed, so a course that is already over can be brought back down step by step.
 * changes: instrumentId → new marksPct; added: a new item being created.
 */
export async function overTargetError(courseId: string, source: "SE" | "INSTRUCTOR", changes: Map<string, number>, added?: { type: string; marksPct: number }) {
  const [course, items] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: PLAN_SELECT }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source }, select: { id: true, type: true, marksPct: true } }),
  ]);
  const plan = planFor(course, source);
  const sums = (useNew: boolean) => {
    const by = new Map<string, number[]>();
    for (const i of items) by.set(i.type, [...(by.get(i.type) || []), useNew && changes.has(i.id) ? changes.get(i.id)! : i.marksPct]);
    if (useNew && added) by.set(added.type, [...(by.get(added.type) || []), added.marksPct]);
    const out = new Map<string, number>();
    for (const [t, ws] of Array.from(by.entries())) out.set(t, effectiveSum(ws, t === "Quiz" ? plan.quizBestOf : t === "Assignment" ? plan.assignmentBestOf : null));
    return out;
  };
  const before = sums(false), after = sums(true);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const [t, v] of Array.from(after.entries())) {
    const target = plan[TARGET[t]];
    if (target == null || !(t in TARGET)) continue;
    if (v > target + 0.05 && v > (before.get(t) || 0) + 0.001) return `${t} marks would total ${r2(v)}%, above the ${target}% target for ${t.toLowerCase()}s. Lower the other ${t.toLowerCase()}s first, or change the target in Assessment Weights.`;
  }
  const total = (m: Map<string, number>) => Array.from(m.values()).reduce((a, b) => a + b, 0);
  if (total(after) > 100.05 && total(after) > total(before) + 0.001) return `All assessments would add up to ${r2(total(after))}% — more than 100% of the course.`;
  return null;
}
