import { prisma } from "./db";
import { getPolicyForCourse, coverageRules } from "./weightPolicy";

/**
 * Checks a course's plan against the OMC's coverage rules for its course type: every PLO the course serves (through its
 * CLOs) must carry at least ploMinPct % of the marks and be tested by at least ploMinItems different assessment items.
 * Returns one line per PLO that falls short (empty when all is well or no rule is set) plus the rules themselves.
 */
export async function ploCoverageShortfalls(courseId: string, source: "SE" | "INSTRUCTOR" = "SE") {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { courseType: true, coordinator: { select: { managedById: true } } } });
  const policy = course ? await getPolicyForCourse(course.coordinator?.managedById || null, course.courseType) : null;
  const rules = coverageRules(policy as unknown as Record<string, unknown>);
  if (!course || (!rules.ploMinPct && !rules.ploMinItems)) return { rules, short: [] as string[] };
  const [clos, rows] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "SE" }, select: { id: true, mappedPloId: true, mappedPlo: { select: { number: true } } } }),
    prisma.lectureRow.findMany({ where: { courseId, source }, select: { cloId: true, weightPct: true, topic: true, instrumentLinks: { select: { instrumentId: true } } } }),
  ]);
  const ploOf = new Map(clos.map((c) => [c.id, c.mappedPloId ? { id: c.mappedPloId, n: c.mappedPlo?.number } : null]));
  const stats = new Map<string, { n?: number; pct: number; items: Set<string> }>();
  for (const c of clos) if (c.mappedPloId && !stats.has(c.mappedPloId)) stats.set(c.mappedPloId, { n: c.mappedPlo?.number, pct: 0, items: new Set() });
  for (const r of rows) {
    const p = r.cloId ? ploOf.get(r.cloId) : null;
    if (!p || !r.topic.trim()) continue;
    const st = stats.get(p.id)!;
    st.pct += r.weightPct;
    r.instrumentLinks.forEach((l) => st.items.add(l.instrumentId));
  }
  const short: string[] = [];
  for (const st of Array.from(stats.values()).sort((a, b) => (a.n ?? 99) - (b.n ?? 99))) {
    const why: string[] = [];
    if (rules.ploMinPct && st.pct < rules.ploMinPct - 0.05) why.push(`${Math.round(st.pct * 100) / 100}% of marks (needs ${rules.ploMinPct}%)`);
    if (rules.ploMinItems && st.items.size < rules.ploMinItems) why.push(`${st.items.size} assessment item(s) (needs ${rules.ploMinItems})`);
    if (why.length) short.push(`PLO-${st.n ?? "?"}: ${why.join(", ")}`);
  }
  return { rules, short };
}
