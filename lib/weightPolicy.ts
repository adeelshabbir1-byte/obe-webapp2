import { prisma } from "./db";
import { normalizeCourseType } from "./courseTypeColors";

export type WeightValues = {
  assignmentPct: number; quizPct: number; projectPct: number;
  labPct: number; midtermPct: number; finalPct: number;
};

export async function getPolicyForCourse(chairmanId: string | null, courseType: string) {
  if (!chairmanId) return null;
  return prisma.weightPolicy.findUnique({ where: { chairmanId_courseType: { chairmanId, courseType: normalizeCourseType(courseType) } } });
}

/** Returns the list of fields that fall outside the policy's range, empty if compliant or no policy set. */
export function checkPolicyCompliance(weights: WeightValues, policy: Awaited<ReturnType<typeof getPolicyForCourse>>): string[] {
  if (!policy) return [];
  const violations: string[] = [];
  const pairs: [keyof WeightValues, string][] = [
    ["assignmentPct", "assignment"], ["quizPct", "quiz"], ["projectPct", "project"],
    ["labPct", "lab"], ["midtermPct", "midterm"], ["finalPct", "final"],
  ];
  for (const [field, key] of pairs) {
    const val = weights[field];
    const min = (policy as any)[`${key}Min`];
    const max = (policy as any)[`${key}Max`];
    if (val < min || val > max) violations.push(`${key} (${val}% — policy allows ${min}-${max}%)`);
  }
  return violations;
}
