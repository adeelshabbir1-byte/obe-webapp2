// HEC stage-gates with no database. A national curriculum is published only when all three gates pass:
//  Gate 1 (categories): total degree credit hours set; every counted category has a name, minimum courses and minimum
//         credit hours; the categories' credit hours add up exactly to the total.
//  Gate 2 (course list): mandatory categories hold enough courses and credit hours; an elective pool offers a choice
//         buffer — at least 1.5 × the courses students must take (4 required → 6 in the pool).
//  Gate 3 (model course detail, every course 100%): basic info (description, prerequisites decided, theory / lab split),
//         contact hours (1 theory CH = 1 h/week = 16 h; 1 lab CH = 3 h/week = 48 h; a lab needs a 16-week experiment
//         plan), at least 4 CLOs with Bloom levels, the CLO→PLO matrix (every CLO maps; each PLO's CLO weights total
//         100%), and 16 weeks of topics each mapped to a CLO with acyclic topic and course dependencies.

export type GKind = "GE" | "CORE" | "SUPPORTING" | "LAB" | "IDS" | "ELECTIVE_SLOT" | "CAPSTONE" | "INTERNSHIP" | "ELECTIVE_LIST" | "IDS_LIST" | "NONCREDIT";
export const COUNTED: GKind[] = ["GE", "CORE", "SUPPORTING", "LAB", "IDS", "ELECTIVE_SLOT", "CAPSTONE", "INTERNSHIP"];
export const POOLS: GKind[] = ["ELECTIVE_LIST", "IDS_LIST"];
export type GType = { name: string; kind: GKind; minCourses: number | null; minCredits: number | null };
export type GCourse = {
  id: string; code: string; title: string; creditHours: number; labCredits: number; category: string; description: string | null;
  prerequisiteId: string | null; noPrereq: boolean;
  clos: { id: string; n: number; bloom: string | null; ploIds: string[] }[];
  weights: { cloId: string; ploId: string; pct: number }[]; // explicit CLO→PLO weights (else equal shares)
  topics: { lecture: number; cloNumber: number | null }[];
  labWeeks: number[]; // weeks of the lab experiment plan
  topicDeps: { lecture: number; onCourseId: string; onLecture: number }[];
};
export type Issue = { gate: 1 | 2 | 3; text: string; courseId?: string };

export function gate1(totalCredits: number | null, types: GType[]): Issue[] {
  const out: Issue[] = [];
  if (!totalCredits || totalCredits <= 0) out.push({ gate: 1, text: "Set the total degree credit hours (e.g. 130–136 for BSSE: give the exact total)." });
  const counted = types.filter((t) => COUNTED.includes(t.kind));
  if (!counted.length) out.push({ gate: 1, text: "Add the categories of the degree." });
  for (const t of counted) {
    if (!t.name.trim()) out.push({ gate: 1, text: "A category has no name." });
    if (t.minCourses == null) out.push({ gate: 1, text: `${t.name}: set the minimum number of courses.` });
    if (t.minCredits == null) out.push({ gate: 1, text: `${t.name}: set the minimum credit hours.` });
  }
  const sum = counted.reduce((a, t) => a + (t.minCredits || 0), 0);
  if (totalCredits && counted.every((t) => t.minCredits != null) && sum !== totalCredits) out.push({ gate: 1, text: `Category credit hours add up to ${sum}, not the degree's ${totalCredits} — ${sum > totalCredits ? `${sum - totalCredits} too many` : `${totalCredits - sum} short`}.` });
  return out;
}

/** How many pool courses students must take: the elective slots' courses (or the pool's own minimum). */
export const poolRequired = (pool: GType, types: GType[], courses: GCourse[]) => {
  const slotKind = pool.kind === "IDS_LIST" ? "IDS" : "ELECTIVE_SLOT";
  const slots = types.filter((t) => t.kind === slotKind).reduce((a, t) => a + courses.filter((c) => c.category === t.name).length, 0);
  return Math.max(pool.minCourses || 0, slots);
};
export const poolBuffer = (required: number) => Math.ceil(required * 1.5);
export function gate2(types: GType[], courses: GCourse[]): Issue[] {
  const out: Issue[] = [];
  for (const t of types.filter((x) => COUNTED.includes(x.kind) && x.kind !== "ELECTIVE_SLOT")) {
    const cs = courses.filter((c) => c.category === t.name), ch = cs.reduce((a, c) => a + c.creditHours, 0);
    if (t.minCourses != null && cs.length < t.minCourses) out.push({ gate: 2, text: `${t.name}: ${cs.length} course(s), needs ${t.minCourses}.` });
    if (t.minCredits != null && ch < t.minCredits) out.push({ gate: 2, text: `${t.name}: ${ch} credit hours, needs ${t.minCredits}.` });
  }
  for (const p of types.filter((x) => POOLS.includes(x.kind))) {
    const req = poolRequired(p, types, courses), have = courses.filter((c) => c.category === p.name).length;
    if (req && have < poolBuffer(req)) out.push({ gate: 2, text: `${p.name}: ${have} course(s) in the pool; students take ${req}, so it needs at least ${poolBuffer(req)} to give a choice.` });
  }
  const uncategorised = courses.filter((c) => !types.some((t) => t.name === c.category));
  if (uncategorised.length) out.push({ gate: 2, text: `${uncategorised.length} course(s) are in no category (${uncategorised.slice(0, 3).map((c) => c.title).join(", ")}).` });
  return out;
}

/** Contact hours: 1 theory CH = 1 h/week (16 h); 1 lab CH = 3 h/week (48 h). */
export function contactHours(c: Pick<GCourse, "creditHours" | "labCredits">) {
  const theory = Math.max(0, c.creditHours - c.labCredits);
  return { theory, lab: c.labCredits, theoryPerWeek: theory, labPerWeek: 3 * c.labCredits, theorySemester: 16 * theory, labSemester: 48 * c.labCredits };
}
const weekOf = (lecture: number, lecturesPerWeek = 2) => Math.ceil(lecture / lecturesPerWeek);
/** A cycle in topic / course dependencies, as the path, or null. */
export function findCycle(edges: [string, string][]) {
  const next = new Map<string, string[]>();
  for (const [a, b] of edges) next.set(a, [...(next.get(a) || []), b]);
  const state = new Map<string, 1 | 2>(), stack: string[] = [];
  const visit = (n: string): string[] | null => {
    state.set(n, 1); stack.push(n);
    for (const m of next.get(n) || []) {
      if (state.get(m) === 1) return [...stack.slice(stack.indexOf(m)), m];
      if (!state.has(m)) { const c = visit(m); if (c) return c; }
    }
    stack.pop(); state.set(n, 2); return null;
  };
  for (const n of Array.from(next.keys())) if (!state.has(n)) { const c = visit(n); if (c) return c; }
  return null;
}

export type CourseCheck = { courseId: string; parts: { key: string; label: string; ok: boolean; why: string[] }[]; pct: number };
export function gate3Course(c: GCourse, all: GCourse[]): CourseCheck {
  const parts: CourseCheck["parts"] = [];
  const add = (key: string, label: string, why: string[]) => parts.push({ key, label, ok: !why.length, why });
  add("basic", "Basic info", [
    ...(!(c.description || "").trim() ? ["No course description."] : []),
    ...(!c.prerequisiteId && !c.noPrereq ? ["Prerequisites not decided (set one, or mark “none”)."] : []),
    ...(c.labCredits < 0 || c.labCredits > c.creditHours ? ["Theory / lab split does not fit the credit hours."] : []),
  ]);
  const h = contactHours(c);
  add("contact", "Contact hours", [
    ...(h.theory > 0 && new Set(c.topics.map((t) => weekOf(t.lecture))).size < 16 ? [`Theory ${h.theory} CH = ${h.theorySemester} contact hours over 16 weeks, but the lecture plan covers ${new Set(c.topics.map((t) => weekOf(t.lecture))).size} week(s).`] : []),
    ...(c.labCredits > 0 && new Set(c.labWeeks).size < 16 ? [`Lab ${c.labCredits} CH = ${h.labSemester} contact hours: the 16-week lab experiment plan has ${new Set(c.labWeeks).size} week(s).`] : []),
  ]);
  add("clos", "CLOs", [
    ...(c.clos.length < 4 ? [`${c.clos.length} CLO(s) — at least 4 are needed.`] : []),
    ...c.clos.filter((x) => !x.bloom || !/^[CPA][1-7]$/.test(x.bloom)).map((x) => `CLO-${x.n} has no Bloom level.`),
  ]);
  // The matrix: explicit weights where given, else the PLO's CLOs share it equally.
  const ploIds = Array.from(new Set(c.clos.flatMap((x) => x.ploIds)));
  const matrix: string[] = c.clos.filter((x) => !x.ploIds.length).map((x) => `CLO-${x.n} maps to no PLO.`);
  for (const p of ploIds) {
    const contributors = c.clos.filter((x) => x.ploIds.includes(p));
    const explicit = c.weights.filter((w) => w.ploId === p && contributors.some((x) => x.id === w.cloId));
    const sum = explicit.length ? Math.round(explicit.reduce((a, w) => a + w.pct, 0) * 100) / 100 : 100;
    if (explicit.length && explicit.length < contributors.length) matrix.push(`A PLO has weights for ${explicit.length} of its ${contributors.length} CLOs.`);
    else if (Math.abs(sum - 100) > 0.01) matrix.push(`A PLO's CLO weights add up to ${sum}%, not 100%.`);
  }
  add("matrix", "CLO→PLO matrix", matrix);
  const weeks = new Set(c.topics.map((t) => weekOf(t.lecture)));
  const cycle = findCycle(c.topicDeps.map((d) => [`${c.id}:${d.lecture}`, `${d.onCourseId}:${d.onLecture}`] as [string, string]).concat(all.flatMap((x) => x.topicDeps.filter((d) => x.id !== c.id).map((d) => [`${x.id}:${d.lecture}`, `${d.onCourseId}:${d.onLecture}`] as [string, string]))));
  add("topics", "Weekly topics", [
    ...(weeks.size !== 16 ? [`${weeks.size} week(s) of topics — exactly 16 are needed.`] : []),
    ...(c.topics.filter((t) => !t.cloNumber).length ? [`${c.topics.filter((t) => !t.cloNumber).length} topic(s) map to no CLO.`] : []),
    ...(cycle && cycle.some((n) => n.startsWith(`${c.id}:`)) ? ["Topic dependencies form a cycle."] : []),
  ]);
  const ok = parts.filter((p) => p.ok).length;
  return { courseId: c.id, parts, pct: Math.round((100 * ok) / parts.length) };
}
export function gate3(courses: GCourse[]) {
  const checks = courses.map((c) => gate3Course(c, courses));
  const courseCycle = findCycle(courses.filter((c) => c.prerequisiteId).map((c) => [c.id, c.prerequisiteId!] as [string, string]));
  const issues: Issue[] = [
    ...checks.filter((x) => x.pct < 100).map((x) => { const c = courses.find((y) => y.id === x.courseId)!; return { gate: 3 as const, courseId: c.id, text: `${c.code} ${c.title}: ${x.parts.filter((p) => !p.ok).map((p) => p.label).join(", ")}` }; }),
    ...(courseCycle ? [{ gate: 3 as const, text: `Course prerequisites form a cycle: ${courseCycle.map((id) => courses.find((c) => c.id === id)?.code || id).join(" → ")}.` }] : []),
  ];
  return { checks, compliant: checks.filter((x) => x.pct === 100).length, total: courses.length, issues };
}
/** All three gates, in order: a later gate is open only when the earlier ones pass. */
export function gates(totalCredits: number | null, types: GType[], courses: GCourse[]) {
  const g1 = gate1(totalCredits, types), g2 = gate2(types, courses), g3 = gate3(courses);
  const open2 = !g1.length, open3 = open2 && !g2.length;
  return { g1, g2, g3, open2, open3, publishable: open3 && !g3.issues.length && g3.compliant === g3.total };
}

/** Evolutionary seeding: a course's category in the new revision, from the convener's transition map. */
export const translateCategory = (old: string, map: { fromName: string; toName: string }[]) => map.find((m) => m.fromName.trim().toLowerCase() === old.trim().toLowerCase())?.toName ?? null;
