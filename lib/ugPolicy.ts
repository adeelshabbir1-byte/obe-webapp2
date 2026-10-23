import { prisma } from "./db";

// HEC Undergraduate Education Policy 2023: the General Education requirements (12 courses, 30 credit hours) by name,
// which of the program's courses meets each one, and exactly what to add, rename or retype when one is not met.
// A course is matched by what the Program Lead marked; otherwise OBEHUB suggests one from the course title.

export const pdb = prisma as unknown as Record<string, any>;
export const UG_HINT = "Marking which course meets which requirement needs prisma/migration_ug_policy.sql — run it in Supabase.";

export type GeReq = { key: string; rule: string; label: string; courses: number; credits: number; name: string; match: RegExp; note?: string };
export const GE_REQS: GeReq[] = [
  { key: "ARTS", rule: "geArts", label: "Arts and Humanities", courses: 1, credits: 2, name: "an Arts & Humanities course (e.g. Philosophy, History, Literature, Art)", match: /\b(arts?|humanities|philosophy|history|literature|music|culture|formal logic|critical thinking|fine art|calligraphy)\b/i },
  { key: "NATURAL", rule: "geNatural", label: "Natural Sciences", courses: 1, credits: 3, name: "a Natural Science course (e.g. Applied Physics, 2+1 with lab)", match: /physics|chemistry|biology|natural science|environmental science|earth science/i, note: "2 + 1 credits when it has a lab" },
  { key: "SOCIAL", rule: "geSocial", label: "Social Sciences", courses: 1, credits: 2, name: "a Social Science course (e.g. Psychology, Sociology, Economics)", match: /psycholog|sociolog|economics|social science|political science|anthropolog|international relations|human resource|organi[sz]ational behaviou?r/i },
  { key: "ENGLISH", rule: "geEnglish", label: "Functional English", courses: 1, credits: 3, name: "Functional English", match: /functional english|english (comprehension|composition|language)|communication skills/i },
  { key: "EXPOSITORY", rule: "geExpository", label: "Expository Writing", courses: 1, credits: 3, name: "Expository Writing", match: /expository|academic writing/i },
  { key: "QR", rule: "geQr", label: "Quantitative Reasoning I and II", courses: 2, credits: 6, name: "Quantitative Reasoning I and II (e.g. Calculus, Statistics, Discrete Structures)", match: /quantitative|calculus|statistic|discrete|mathematics|linear algebra|probability/i, note: "two courses of 3 credits" },
  { key: "ISLAMIC", rule: "geIslamic", label: "Islamic Studies (Ethics for non-Muslim students)", courses: 1, credits: 2, name: "Islamic Studies / Ethics", match: /islam|ethics|seerat/i },
  { key: "IDEOLOGY", rule: "geIdeology", label: "Ideology and Constitution of Pakistan", courses: 1, credits: 2, name: "Ideology and Constitution of Pakistan", match: /ideology|constitution|pakistan studies/i },
  { key: "ICT", rule: "geIct", label: "Applications of Information and Communication Technologies", courses: 1, credits: 3, name: "Applications of ICT (2 + 1)", match: /\bict\b|information and communication|applications of (information|computing)|introduction to (computing|computers|information technology)/i, note: "2 + 1 credits" },
  { key: "ENTREPRENEURSHIP", rule: "geEntrepreneurship", label: "Entrepreneurship", courses: 1, credits: 2, name: "Entrepreneurship", match: /entrepreneur/i },
  { key: "CIVICS", rule: "geCivics", label: "Civics and Community Engagement", courses: 1, credits: 2, name: "Civics and Community Engagement", match: /civic|community engagement/i },
];
export const GE_TOTAL = { courses: 12, credits: 30 };
export const GE_RULE_DEFAULTS = Object.fromEntries(GE_REQS.map((r) => [r.rule, r.credits])) as Record<string, number>;
export const GE_RULE_LABELS: [string, string][] = GE_REQS.map((r) => [r.rule, `General Education: ${r.label} (credits)`]);

type C = { code: string; title: string; creditHours: number; courseType: string; semesterNumber: number | null; isNonCredit: boolean; trackName: string | null };
export type GeLine = { req: GeReq; credits: number; needed: number; courses: { code: string; title: string; credits: number; marked: boolean; type: string }[]; ok: boolean; todo: string[] };

/** Marked courses (course code → requirement key) of a program. */
export async function geMarks(chairmanId: string, program: string): Promise<Map<string, string> | null> {
  try {
    const rows = (await pdb.policyCourseMap.findMany({ where: { chairmanId, program } })) as { courseCode: string; requirement: string }[];
    return new Map(rows.map((r) => [r.courseCode, r.requirement]));
  } catch { return null; }
}

/** Each General Education requirement against the scheme of studies: met or not, and what to do. */
export function checkGenEd(courses: C[], marks: Map<string, string>, rules: Record<string, number>): GeLine[] {
  const cs = courses.filter((c) => !c.isNonCredit && !c.trackName);
  const byCode = new Map(cs.map((c) => [c.code, c]));
  const used = new Set<string>();
  const lines: GeLine[] = [];
  for (const req of GE_REQS) {
    const needed = rules[req.rule] ?? req.credits;
    // Courses marked for this requirement; if none, OBEHUB's suggestion from the title (a course is used only once).
    let picked = Array.from(marks.entries()).filter(([, r]) => r === req.key).map(([code]) => byCode.get(code)).filter((x): x is C => !!x).map((c) => ({ c, marked: true }));
    if (!picked.length) picked = cs.filter((c) => !used.has(c.code) && !marks.has(c.code) && req.match.test(c.title) && ((c.courseType || "").toLowerCase() === "general education" || req.key !== "QR" || /quantitative/i.test(c.title))).slice(0, req.courses).map((c) => ({ c, marked: false }));
    // Quantitative Reasoning: when nothing is typed General Education, suggest the program's own maths courses.
    if (!picked.length && req.key === "QR") picked = cs.filter((c) => !used.has(c.code) && !marks.has(c.code) && req.match.test(c.title)).slice(0, 2).map((c) => ({ c, marked: false }));
    for (const p of picked) used.add(p.c.code);
    const credits = picked.reduce((t, p) => t + (p.c.creditHours || 0), 0);
    const todo: string[] = [];
    if (!picked.length) todo.push(`Add ${req.name}, ${needed} credit hours${req.courses > 1 ? ` over ${req.courses} courses` : ""}${req.note ? ` (${req.note})` : ""}, or mark an existing course for it.`);
    else {
      if (picked.length < req.courses) todo.push(`Add ${req.courses - picked.length} more course(s): the policy asks for ${req.courses}.`);
      if (credits < needed) todo.push(`Needs ${needed} credit hours; your course(s) give ${credits}.`);
      for (const p of picked) {
        if ((p.c.courseType || "").toLowerCase() !== "general education") todo.push(`Change the type of ${p.c.code} to “General Education” so it counts in the General Education total.`);
        if (p.marked && !req.match.test(p.c.title)) todo.push(`Consider renaming ${p.c.code} “${p.c.title}” so the transcript shows it is ${req.label}.`);
        if (!p.marked) todo.push(`Confirm that ${p.c.code} “${p.c.title}” is the course for this requirement.`);
      }
    }
    lines.push({ req, credits, needed, courses: picked.map((p) => ({ code: p.c.code, title: p.c.title, credits: p.c.creditHours, marked: p.marked, type: p.c.courseType })), ok: picked.length >= req.courses && credits >= needed, todo });
  }
  return lines;
}
export function genEdSummary(lines: GeLine[]) {
  const met = lines.filter((l) => l.ok).length;
  const credits = lines.reduce((t, l) => t + l.credits, 0);
  return { met, total: lines.length, credits, ok: met === lines.length && credits >= GE_TOTAL.credits };
}
