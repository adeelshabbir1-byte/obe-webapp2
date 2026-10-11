import { prisma } from "./db";
import { getPolicyForCourse, coverageRules } from "./weightPolicy";
import { isTeachingTopic } from "./courseProgress";

export type CoverageRules = ReturnType<typeof coverageRules>;
export type CoverageInput = {
  clos: { id: string; code: string; mappedPloId: string | null; ploNumber: number | null }[];
  rows: { cloId: string | null; weightPct: number; topic: string; instrumentIds: string[] }[];
};
export type CoverageResult = { topicShort: string[]; assessShort: string[]; short: string[] };

/**
 * The OMC's minimums for one course's plan, and nothing more: every CLO needs cloMinTopics lecture topics, every PLO the
 * course serves needs ploMinTopics topics, ploMinPct % of the marks and ploMinItems different assessment items. Once those
 * are met it does not matter that some lectures have no CLO or are not tested by any quiz/exam.
 * Exam and review slots never count as topics.
 */
export function evaluateCoverage(rules: CoverageRules, input: CoverageInput): CoverageResult {
  const cloById = new Map(input.clos.map((c) => [c.id, c]));
  const cloTopics = new Map<string, number>();
  const plo = new Map<string, { n: number | null; topics: number; pct: number; items: Set<string> }>();
  for (const c of input.clos) {
    cloTopics.set(c.id, 0);
    if (c.mappedPloId && !plo.has(c.mappedPloId)) plo.set(c.mappedPloId, { n: c.ploNumber, topics: 0, pct: 0, items: new Set() });
  }
  for (const r of input.rows) {
    const c = r.cloId ? cloById.get(r.cloId) : null;
    if (!c) continue;
    const teaching = isTeachingTopic(r.topic);
    if (teaching) cloTopics.set(c.id, (cloTopics.get(c.id) || 0) + 1);
    const p = c.mappedPloId ? plo.get(c.mappedPloId) : null;
    if (!p || !(r.topic || "").trim()) continue;
    if (teaching) p.topics++;
    p.pct += r.weightPct;
    r.instrumentIds.forEach((id) => p.items.add(id));
  }
  const topicShort: string[] = [], assessShort: string[] = [];
  if (rules.cloMinTopics > 0) {
    const low = input.clos.filter((c) => (cloTopics.get(c.id) || 0) < rules.cloMinTopics);
    if (low.length) topicShort.push(`${low.map((c) => `${c.code} has ${cloTopics.get(c.id) || 0}`).join(", ")} lecture topic(s) (OMC asks for ${rules.cloMinTopics} per CLO)`);
  }
  for (const st of Array.from(plo.values()).sort((a, b) => (a.n ?? 99) - (b.n ?? 99))) {
    if (rules.ploMinTopics > 0 && st.topics < rules.ploMinTopics) topicShort.push(`PLO-${st.n ?? "?"} has ${st.topics} lecture topic(s) (OMC asks for ${rules.ploMinTopics})`);
    const why: string[] = [];
    if (rules.ploMinPct && st.pct < rules.ploMinPct - 0.05) why.push(`${Math.round(st.pct * 100) / 100}% of marks (needs ${rules.ploMinPct}%)`);
    if (rules.ploMinItems && st.items.size < rules.ploMinItems) why.push(`${st.items.size} assessment item(s) (needs ${rules.ploMinItems})`);
    if (why.length) assessShort.push(`PLO-${st.n ?? "?"}: ${why.join(", ")}`);
  }
  return { topicShort, assessShort, short: [...topicShort, ...assessShort] };
}

/** Loads one course's plan (SE or Instructor copy) and checks it against the OMC's rules for its course type. */
export async function ploCoverageShortfalls(courseId: string, source: "SE" | "INSTRUCTOR" = "SE") {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { courseType: true, coordinator: { select: { managedById: true } } } });
  const policy = course ? await getPolicyForCourse(course.coordinator?.managedById || null, course.courseType) : null;
  const rules = coverageRules(policy as unknown as Record<string, unknown>);
  if (!course) return { rules, short: [] as string[], topicShort: [] as string[], assessShort: [] as string[] };
  const [clos, rows] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source }, select: { id: true, code: true, mappedPloId: true, mappedPlo: { select: { number: true } } } }),
    prisma.lectureRow.findMany({ where: { courseId, source }, select: { cloId: true, weightPct: true, topic: true, instrumentLinks: { select: { instrumentId: true } } } }),
  ]);
  const res = evaluateCoverage(rules, {
    clos: clos.map((c) => ({ id: c.id, code: c.code, mappedPloId: c.mappedPloId, ploNumber: c.mappedPlo?.number ?? null })),
    rows: rows.map((r) => ({ cloId: r.cloId, weightPct: r.weightPct, topic: r.topic, instrumentIds: r.instrumentLinks.map((l) => l.instrumentId) })),
  });
  return { rules, ...res };
}
