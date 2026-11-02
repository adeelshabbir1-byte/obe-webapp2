// Skills transcript (queue item 8.5), pure part: a student's attainment of each graduate attribute across the courses
// already on his transcript (simple average of the courses that measured it), with the level words the institute
// already uses for CLOs (Excellent / Good / Satisfactory / Not yet).
export type GaEntry = { label: string; pct: number; passed?: boolean };
export const LEVELS = { excellent: 80, good: 60, satisfactory: 50 };
export const level = (p: number) => (p >= LEVELS.excellent ? "Excellent" : p >= LEVELS.good ? "Good" : p >= LEVELS.satisfactory ? "Satisfactory" : "Not yet");
export function gaAverages(records: { courseCode: string; ploAttainmentJson: string }[]) {
  const by = new Map<number, { sum: number; n: number; courses: string[] }>();
  for (const r of records) {
    let es: GaEntry[] = []; try { es = JSON.parse(r.ploAttainmentJson); } catch { continue; }
    for (const e of es) {
      const m = /(\d+)/.exec(e.label || ""); if (!m || typeof e.pct !== "number") continue;
      const n = Number(m[1]); const o = by.get(n) || { sum: 0, n: 0, courses: [] };
      o.sum += e.pct; o.n++; if (!o.courses.includes(r.courseCode)) o.courses.push(r.courseCode); by.set(n, o);
    }
  }
  return Array.from(by.entries()).sort((a, b) => a[0] - b[0]).map(([number, o]) => { const pct = Math.round((10 * o.sum) / o.n) / 10; return { number, pct, level: level(pct), courses: o.courses }; });
}
