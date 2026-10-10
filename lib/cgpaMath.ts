/** One graded attempt at a course. */
export type Attempt = { courseCode: string; creditHours: number; gpaPoints: number | null };

/**
 * CGPA rule: when a course was taken more than once, only the BEST attempt counts (a retaken F no longer drags the average).
 * Attempts without grade points (withdrawn, pass/fail deficiency courses) are ignored.
 */
export function bestAttemptTotals(attempts: Attempt[]): { points: number; credits: number } {
  const best = new Map<string, Attempt>();
  for (const a of attempts) {
    if (a.gpaPoints === null) continue;
    const key = a.courseCode.trim().toUpperCase();
    const cur = best.get(key);
    if (!cur || (a.gpaPoints as number) > (cur.gpaPoints as number)) best.set(key, a);
  }
  let points = 0, credits = 0;
  best.forEach((a) => { points += (a.gpaPoints as number) * a.creditHours; credits += a.creditHours; });
  return { points, credits };
}
