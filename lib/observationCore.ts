// Classroom observation (queue item 8.4), pure part: the short form and its summary. Each area is rated 1–4.
export const AREAS: [string, string][] = [
  ["prep", "Preparation: plan, material and the lecture's CLO clear"],
  ["clarity", "Clear explanation and examples"],
  ["engage", "Students engaged (questions, activity, discussion)"],
  ["clo", "Teaching and any in-class check matched the CLO"],
  ["time", "Time used well; the planned topic covered"],
  ["climate", "Respectful, inclusive class"],
];
export const RATING: Record<number, string> = { 1: "Needs a lot of work", 2: "Needs some work", 3: "Good", 4: "Very good" };
export function summary(scores: Record<string, number>, planned: string | null, taught: string | null) {
  const v = AREAS.map(([k]) => Number(scores[k])).filter((x) => x >= 1 && x <= 4);
  const avg = v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  const onPlan = !planned || !taught ? null : planned.trim().toLowerCase() === taught.trim().toLowerCase() || taught.toLowerCase().includes(planned.toLowerCase().slice(0, 12));
  return { avg, rated: v.length, onPlan, weak: AREAS.filter(([k]) => Number(scores[k]) > 0 && Number(scores[k]) <= 2).map(([, l]) => l) };
}
export function cleanScores(raw: unknown): Record<string, number> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(AREAS.map(([k]) => [k, Math.round(Number(o[k]))]).filter(([, v]) => (v as number) >= 1 && (v as number) <= 4));
}
