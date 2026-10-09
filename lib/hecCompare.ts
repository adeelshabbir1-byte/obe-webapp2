import { prisma } from "./db";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Official (shared) reference curricula, HEC first. */
export async function referenceCurricula() {
  return prisma.masterCurriculum.findMany({
    where: { chairmanId: null, status: "PUBLISHED" },
    select: { id: true, authority: true, title: true, version: true, degreeProgram: true, parentCurriculumId: true },
    orderBy: [{ authority: "asc" }, { title: "asc" }],
  });
}

export async function computeHecComparison(leadId: string, batchIdParam: string, curriculumIdParam: string) {
  const [batches, refs] = await Promise.all([
    prisma.batch.findMany({ where: { coordinatorId: leadId }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] }),
    referenceCurricula(),
  ]);
  const batch = batches.find((b) => b.id === batchIdParam) || batches[0] || null;
  const dp = norm(batch?.degreeProgram || "");
  const ref =
    refs.find((r) => r.id === curriculumIdParam) ||
    refs.find((r) => r.degreeProgram && norm(r.degreeProgram) === dp) ||
    refs.find((r) => dp && norm(r.title).includes(dp)) ||
    refs.find((r) => r.authority === "HEC") || refs[0] || null;
  if (!batch || !ref) return { batches, refs, batch, ref, empty: true as const };

  const [master, mine] = await Promise.all([
    prisma.masterCourse.findMany({ where: { masterCurriculumId: ref.id }, select: { id: true, code: true, title: true, creditHours: true, category: true, domain: true, semesterNumber: true } }),
    prisma.course.findMany({ where: { coordinatorId: leadId, batchId: batch.id }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, courseType: true, isNonCredit: true, masterCourseId: true } }),
  ]);

  const byId = new Map(master.map((m) => [m.id, m]));
  const byCode = new Map(master.map((m) => [norm(m.code), m]));
  const byTitle = new Map(master.map((m) => [norm(m.title), m]));
  const used = new Set<string>();
  const matched: { c: (typeof mine)[number]; m: (typeof master)[number]; how: string }[] = [];
  const extra: (typeof mine)[number][] = [];
  for (const c of mine) {
    let m = c.masterCourseId ? byId.get(c.masterCourseId) : undefined, how = "linked";
    if (!m) { m = byCode.get(norm(c.code)); how = "same code"; }
    if (!m) { m = byTitle.get(norm(c.title)); how = "same title"; }
    if (m && !used.has(m.id)) { used.add(m.id); matched.push({ c, m, how }); } else extra.push(c);
  }
  const unmatched = master.filter((m) => !used.has(m.id));
  const optionalElectives = unmatched.filter((m) => !!m.domain);
  const missing = unmatched.filter((m) => !m.domain);
  const differences = matched.filter(({ c, m }) => c.creditHours !== m.creditHours || (m.semesterNumber != null && c.semesterNumber != null && c.semesterNumber !== m.semesterNumber));

  const cats = Array.from(new Set(master.filter((m) => !m.domain).map((m) => m.category)));
  const credit = (x: { creditHours: number }) => x.creditHours;
  const categories = cats.map((cat) => {
    const required = master.filter((m) => !m.domain && m.category === cat);
    return {
      cat,
      hec: required.reduce((n, m) => n + credit(m), 0),
      yours: matched.filter(({ m }) => !m.domain && m.category === cat).reduce((n, x) => n + credit(x.c), 0),
      missing: missing.filter((m) => m.category === cat).length,
    };
  });
  const electiveMatchedCredits = matched.filter(({ m }) => !!m.domain).reduce((n, x) => n + credit(x.c), 0);
  const extraCredits = extra.filter((c) => !c.isNonCredit).reduce((n, c) => n + credit(c), 0);
  const hecTotal = categories.reduce((n, c) => n + c.hec, 0);
  const yoursTotal = mine.filter((c) => !c.isNonCredit).reduce((n, c) => n + credit(c), 0);
  const coverage = master.filter((m) => !m.domain).length ? Math.round(((master.filter((m) => !m.domain).length - missing.length) / master.filter((m) => !m.domain).length) * 100) : null;
  return { batches, refs, batch, ref, empty: false as const, matched, extra, missing, optionalElectives, differences, categories, electiveMatchedCredits, extraCredits, hecTotal, yoursTotal, coverage };
}
