// One-click term rollover (3 Nov 2026), pure part: each course still empty (no plan, no marks) gets the plan of the most
// recent offering of the same course code — preferring the same program, then the newest term.
export type RCourse = { id: string; code: string; program: string; batch: string; semester: number | null; term: number; hasPlan: boolean; hasWork: boolean; offered: boolean; teacher: string };
export function pairs(cs: RCourse[]) {
  const sources = cs.filter((c) => c.hasPlan);
  const out: { target: RCourse; source: RCourse }[] = []; const skipped: { target: RCourse; why: string }[] = [];
  for (const t of cs.filter((c) => !c.hasPlan)) {
    if (t.hasWork) { skipped.push({ target: t, why: "has marks or attendance already" }); continue; }
    const same = sources.filter((s) => s.code.toUpperCase() === t.code.toUpperCase() && s.id !== t.id);
    if (!same.length) { skipped.push({ target: t, why: "no earlier offering with a plan" }); continue; }
    const best = same.sort((a, b) => Number(b.program === t.program) - Number(a.program === t.program) || b.term - a.term)[0];
    out.push({ target: t, source: best });
  }
  return { pairs: out, skipped };
}
