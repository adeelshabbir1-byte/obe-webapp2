// Students' self-assessment of each CLO (queue item 8.6): confidence 1–5 at course end, turned into a 0–100 scale and
// shown beside the direct (marks) result. A gap of more than 20 points either way is flagged.
export const SCALE: [number, string][] = [[1, "Not at all"], [2, "A little"], [3, "Fairly"], [4, "Well"], [5, "Very well"]];
export const toPct = (r: number) => Math.round(((r - 1) / 4) * 100);
export const GAP = 20;
export function compare(selfRatings: number[], direct: number | null) {
  const n = selfRatings.length;
  const self = n ? Math.round(selfRatings.reduce((a, r) => a + toPct(r), 0) / n) : null;
  const gap = self !== null && direct !== null ? self - Math.round(direct) : null;
  return { n, self, direct: direct === null ? null : Math.round(direct), gap, flag: gap === null ? "" : gap > GAP ? "Students feel more confident than their marks show" : gap < -GAP ? "Marks are better than students' confidence" : "" };
}
