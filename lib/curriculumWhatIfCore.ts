// Curriculum change "what if" (queue item 8.8), pure part: what dropping courses does to credit totals, to how many
// courses build each graduate attribute, and to the courses that need a dropped one first.
export type WCourse = { id: string; code: string; title: string; credits: number; semester: number | null; gas: number[]; prereqId: string | null };
export function dropEffect(courses: WCourse[], drop: Set<string>, gas: { number: number; title: string }[]) {
  const keep = courses.filter((c) => !drop.has(c.id));
  const credits = (cs: WCourse[]) => cs.reduce((a, c) => a + (c.credits || 0), 0);
  const cover = (cs: WCourse[], n: number) => cs.filter((c) => c.gas.includes(n)).length;
  const gaRows = gas.map((g) => ({ number: g.number, title: g.title, before: cover(courses, g.number), after: cover(keep, g.number) })).map((r) => ({ ...r, risk: r.after === 0 ? "No course builds it" : r.after < r.before && r.after <= 1 ? "Only one course left" : "" }));
  const dependents = keep.filter((c) => c.prereqId && drop.has(c.prereqId)).map((c) => ({ code: c.code, title: c.title, needs: courses.find((x) => x.id === c.prereqId)?.code || "" }));
  return { creditsBefore: credits(courses), creditsAfter: credits(keep), dropped: courses.filter((c) => drop.has(c.id)).map((c) => `${c.code} ${c.title}`), gaRows, dependents };
}
