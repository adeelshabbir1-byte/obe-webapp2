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
export function checkPolicyCompliance(weights: WeightValues, policy: Awaited<ReturnType<typeof getPolicyForCourse>>, hasLab: boolean = true): string[] {
  if (!policy) return [];
  const violations: string[] = [];
  const pairs: [keyof WeightValues, string][] = [
    ["assignmentPct", "assignment"], ["quizPct", "quiz"], ["projectPct", "project"],
    ["labPct", "lab"], ["midtermPct", "midterm"], ["finalPct", "final"],
  ];
  for (const [field, key] of pairs) {
    if (key === "lab" && !hasLab) continue; // no lab component on this course — 0% is correct, not a violation
    const val = weights[field];
    const min = (policy as any)[`${key}Min`];
    const max = (policy as any)[`${key}Max`];
    if (val < min || val > max) violations.push(`${key} (${val}% — policy allows ${min}-${max}%)`);
  }
  return violations;
}

const KEYS: [keyof WeightValues, string][] = [
  ["finalPct", "final"], ["midtermPct", "midterm"], ["quizPct", "quiz"], ["assignmentPct", "assignment"], ["projectPct", "project"], ["labPct", "lab"],
];
type PolicyLike = Record<string, unknown> | null | undefined;

/**
 * The nearest set of whole-number weights that sits inside the OMC's min-max range for every component and totals 100.
 * Each component is first pulled into its range; any surplus or shortfall is then spread over the components that still
 * have room, largest first. Returns null if the policy itself cannot add up to 100.
 */
export function fitWeightsToPolicy(w: WeightValues, policy: PolicyLike, hasLab = true): WeightValues | null {
  if (!policy) return w;
  const lo = (k: string) => (k === "lab" && !hasLab ? 0 : Number(policy[`${k}Min`] ?? 0));
  const hi = (k: string) => (k === "lab" && !hasLab ? 0 : Number(policy[`${k}Max`] ?? 100));
  if (KEYS.reduce((s, [, k]) => s + lo(k), 0) > 100 || KEYS.reduce((s, [, k]) => s + hi(k), 0) < 100) return null;
  const out = { ...w };
  for (const [f, k] of KEYS) out[f] = Math.min(hi(k), Math.max(lo(k), Math.round(out[f] || 0)));
  let diff = 100 - KEYS.reduce((s, [f]) => s + out[f], 0);
  for (let guard = 0; diff !== 0 && guard < 400; guard++) {
    let room = KEYS.filter(([f, k]) => (diff > 0 ? out[f] < hi(k) : out[f] > lo(k)));
    if (!room.length) break;
    // Prefer components the course already uses; a component at 0% is only switched on if nothing else has room.
    const used = room.filter(([f]) => (w[f] || 0) > 0);
    if (used.length) room = used;
    room.sort((a, b) => out[b[0]] - out[a[0]]);
    for (const [f] of room) { if (diff === 0) break; out[f] += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1; }
  }
  return diff === 0 ? out : null;
}

/**
 * Courses whose weights the Subject Expert has not confirmed yet start from the OMC's limits: their default weights are
 * moved inside the range for their course type. Confirmed, approved or already-marked courses are never touched.
 * Pass a courseId to check one course, or a chairmanId to check every course of the institute. Returns how many changed.
 */
export async function fitUnconfirmedWeightsToPolicy(opts: { courseId?: string; chairmanId?: string }) {
  const { normalizeCourseType } = await import("./courseTypeColors");
  const courses = await prisma.course.findMany({
    where: {
      ...(opts.courseId ? { id: opts.courseId } : {}),
      ...(opts.chairmanId ? { coordinator: { managedById: opts.chairmanId } } : {}),
      weightsConfirmedAt: null, NOT: { templateStatus: "approved" },
    },
    select: { id: true, courseType: true, hasLab: true, assignmentPct: true, quizPct: true, projectPct: true, labPct: true, midtermPct: true, finalPct: true, coordinator: { select: { managedById: true } } },
  });
  if (!courses.length) return 0;
  const marked = new Set((await prisma.studentMark.findMany({ where: { courseId: { in: courses.map((c) => c.id) } }, select: { courseId: true }, distinct: ["courseId"] })).map((m) => m.courseId));
  const policies = new Map<string, Awaited<ReturnType<typeof getPolicyForCourse>>>();
  let changed = 0;
  for (const c of courses) {
    if (marked.has(c.id) || !c.coordinator?.managedById) continue;
    const key = `${c.coordinator.managedById}|${normalizeCourseType(c.courseType)}`;
    if (!policies.has(key)) policies.set(key, await getPolicyForCourse(c.coordinator.managedById, c.courseType));
    const policy = policies.get(key);
    if (!policy) continue;
    const now: WeightValues = { assignmentPct: c.assignmentPct, quizPct: c.quizPct, projectPct: c.projectPct, labPct: c.labPct, midtermPct: c.midtermPct, finalPct: c.finalPct };
    if (checkPolicyCompliance(now, policy, c.hasLab).length === 0) continue;
    const fit = fitWeightsToPolicy(now, policy as unknown as Record<string, unknown>, c.hasLab);
    if (!fit) continue;
    const updated = await prisma.course.update({ where: { id: c.id }, data: fit });
    const { ensureAllInstrumentCounts } = await import("./instrumentAutoFill");
    await ensureAllInstrumentCounts(c.id, "SE", updated).catch(() => {});
    changed++;
  }
  return changed;
}

/** The OMC's assessment-coverage rules for a course type (PLO marks %, PLO assessment items, CLO balance). */
export function coverageRules(policy: PolicyLike) {
  return {
    ploMinPct: Number(policy?.ploMinPct ?? 0) || 0,
    ploMinItems: Number(policy?.ploMinItems ?? 0) || 0,
    cloSpreadMax: policy && policy.cloSpreadMax != null ? Number(policy.cloSpreadMax) : 7,
    cloMinTopics: policy && policy.cloMinTopics != null ? Number(policy.cloMinTopics) : 3,
    ploMinTopics: Number(policy?.ploMinTopics ?? 0) || 0,
  };
}
