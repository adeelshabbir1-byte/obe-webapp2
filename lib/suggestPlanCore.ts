// "Suggest plan" (Adeel prompt §21.4): place a student's remaining courses into semesters. No database here (tested).
// Respects: credit-hour load per semester (min–max), when each course is offered (allowed semesters), prerequisites
// (passed, or planned in an earlier semester), pinned courses and excluded semesters. Priority: failed courses first,
// then prerequisites of many later courses, then core before electives, then the scheme's own order.
export type PCourse = { id: string; code: string; ch: number; scheme: number | null; core: boolean; failed: boolean; prereq: string | null; allowed: (sem: number) => boolean; pinned?: number | null };
export type PlanIn = { courses: PCourse[]; passed: Set<string>; fromSem: number; min: number; max: number; excluded?: number[]; lastSem?: number };
export type PlanOut = { bySem: Record<number, string[]>; ch: Record<number, number>; unfit: { code: string; why: string }[]; graduation: number | null; warnings: string[] };

export function suggestPlan(p: PlanIn): PlanOut {
  const last = p.lastSem ?? p.fromSem + 12;
  const dependents = new Map<string, number>();
  const byId = new Map(p.courses.map((c) => [c.id, c]));
  for (const c of p.courses) if (c.prereq) dependents.set(c.prereq, (dependents.get(c.prereq) || 0) + 1);
  const order = p.courses.slice().sort((a, b) => Number(b.failed) - Number(a.failed) || (dependents.get(b.id) || 0) - (dependents.get(a.id) || 0) || Number(b.core) - Number(a.core) || (a.scheme ?? 99) - (b.scheme ?? 99) || a.code.localeCompare(b.code));
  const placed = new Map<string, number>(), bySem: Record<number, string[]> = {}, ch: Record<number, number> = {};
  const warnings: string[] = [];
  const put = (c: PCourse, s: number) => { placed.set(c.id, s); (bySem[s] ||= []).push(c.code); ch[s] = (ch[s] || 0) + c.ch; };
  for (const c of order) if (c.pinned) put(c, c.pinned);
  const ready = (c: PCourse, s: number) => {
    if (!c.prereq || p.passed.has(c.prereq)) return true;
    const ps = placed.get(c.prereq);
    return ps != null && ps < s;
  };
  // Several passes, so a course waiting for its prerequisite gets placed once that one is.
  for (let pass = 0; pass < 4; pass++) {
    for (const c of order) {
      if (placed.has(c.id)) continue;
      for (let s = p.fromSem; s <= last; s++) {
        if (p.excluded?.includes(s) || !c.allowed(s) || !ready(c, s) || (ch[s] || 0) + c.ch > p.max) continue;
        put(c, s);
        if (c.prereq && !p.passed.has(c.prereq) && placed.has(c.prereq)) {
          const pre = byId.get(c.prereq);
          if (pre && c.scheme != null && s > c.scheme) warnings.push(`${c.code} needs ${pre.code} first, so it moves to semester ${s}`);
        }
        break;
      }
    }
  }
  const unfit = p.courses.filter((c) => !placed.has(c.id)).map((c) => ({ code: c.code, why: c.prereq && !p.passed.has(c.prereq) && !placed.has(c.prereq) ? "its prerequisite can't be placed" : "no semester has room when it is offered" }));
  for (const [s, n] of Object.entries(ch)) if (n < p.min && Number(s) !== Math.max(...Object.keys(ch).map(Number))) warnings.push(`Semester ${s} has only ${n} CH (below ${p.min})`);
  const sems = Object.keys(bySem).map(Number);
  return { bySem, ch, unfit, graduation: unfit.length ? null : sems.length ? Math.max(...sems) : p.fromSem - 1, warnings };
}
