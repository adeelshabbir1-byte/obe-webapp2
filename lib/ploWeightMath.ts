// Course-to-PLO weightage arithmetic (no database, tested in tests/ploWeights.test.ts).
//
// Rule of thumb from the institute: computing courses carry most of the technical PLOs (1-5: knowledge, problem
// analysis, design, tools...), General Education / IDS courses carry most of the soft-skill PLOs (6-10: teamwork,
// communication, professionalism, ethics, life-long learning). They may overlap; this only decides who weighs more.

export type WeightCourse = { id: string; courseType: string; creditHours: number };

/** An outcome counts as attained for the batch when at least this % of students reach it (the CLO default target). */
export const TARGET_PCT = 60;
export const SOFT_PLO_FROM = 6; // PLOs numbered from here are the soft-skill PLOs
const GENERAL = new Set(["general education", "ids", "humanities", "social science"]);
export const courseFamily = (courseType: string) => (GENERAL.has(courseType.trim().toLowerCase()) ? "GENERAL" : /capstone|project|fyp/i.test(courseType) ? "CAPSTONE" : "COMPUTING");

/** Relative pull of a course on a PLO: 3 for its own side (computing -> PLO 1-5, GE/IDS -> PLO 6-10), 1 for the
 * other side; a capstone / FYP pulls 2 on every PLO, since it integrates both. Scaled by credit hours. */
export function affinity(c: WeightCourse, ploNumber: number) {
  const fam = courseFamily(c.courseType);
  const soft = ploNumber >= SOFT_PLO_FROM;
  const f = fam === "CAPSTONE" ? 2 : fam === "GENERAL" ? (soft ? 3 : 1) : (soft ? 1 : 3);
  return f * Math.max(1, c.creditHours || 0);
}

/** Shares that add to exactly 100 (2 decimals; the rounding remainder goes to the largest share). */
export function normalise(raw: { id: string; w: number }[]): Record<string, number> {
  const total = raw.reduce((s, r) => s + Math.max(0, r.w), 0);
  if (!raw.length) return {};
  const out: Record<string, number> = {};
  for (const r of raw) out[r.id] = total > 0 ? Math.round((10000 * Math.max(0, r.w)) / total) / 100 : Math.round(10000 / raw.length) / 100;
  const diff = Math.round((100 - Object.values(out).reduce((a, b) => a + b, 0)) * 100) / 100;
  if (diff !== 0) {
    const big = raw.reduce((a, b) => (out[b.id] > out[a.id] ? b : a)).id;
    out[big] = Math.round((out[big] + diff) * 100) / 100;
  }
  return out;
}

export const equalWeights = (courses: WeightCourse[]) => normalise(courses.map((c) => ({ id: c.id, w: 1 })));
export const suggestedWeights = (courses: WeightCourse[], ploNumber: number) => normalise(courses.map((c) => ({ id: c.id, w: affinity(c, ploNumber) })));

/** A PLO's weights are valid when every mapped course has one, none is negative and they total 100 (±0.05). */
export function checkWeights(courseIds: string[], weights: Record<string, number>): string | null {
  const missing = courseIds.filter((id) => !(id in weights));
  if (missing.length) return `${missing.length} course(s) have no weight.`;
  if (Object.values(weights).some((w) => !Number.isFinite(w) || w < 0)) return "Weights can't be negative.";
  const total = courseIds.reduce((s, id) => s + weights[id], 0);
  if (Math.abs(total - 100) > 0.05) return `Weights add up to ${Math.round(total * 100) / 100}% — they must total 100%.`;
  return null;
}

/** A PLO's attainment for the batch: the weighted average of each course's attainment of it (courses without results yet are left out and the rest re-weighted). */
export function weightedAttainment(weights: Record<string, number>, attainment: Record<string, number | null>) {
  let w = 0, sum = 0;
  for (const [id, wt] of Object.entries(weights)) {
    const a = attainment[id];
    if (a === null || a === undefined) continue;
    w += wt; sum += wt * a;
  }
  return w > 0 ? Math.round((sum / w) * 10) / 10 : null;
}

/** Cohort suggestion for a PLO the previous batch did not reach: the usual suggestion, tilted toward the courses where
 * that batch's students reached the PLO best (factor = course attainment / average, kept between 0.5 and 1.5).
 * Courses with no result last time keep factor 1. */
export function cohortWeights(courses: WeightCourse[], ploNumber: number, lastAttainment: Record<string, number | null>) {
  const known = courses.map((c) => lastAttainment[c.id]).filter((a): a is number => a !== null && a !== undefined);
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  return normalise(courses.map((c) => {
    const a = lastAttainment[c.id];
    const f = a === null || a === undefined || mean <= 0 ? 1 : Math.min(1.5, Math.max(0.5, a / mean));
    return { id: c.id, w: affinity(c, ploNumber) * f };
  }));
}
