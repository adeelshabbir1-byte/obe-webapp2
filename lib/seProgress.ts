import { prisma } from "./db";
import { buildSeProgress, teachingLectureCounts, ProgressStep } from "./courseProgress";
import { coverageRules } from "./weightPolicy";
import { normalizeCourseType } from "./courseTypeColors";
import { evaluateCoverage } from "./ploCoverage";

/** The Subject Expert progress steps for many courses at once (a few queries in total, not per course). */
export async function seProgressFor(courses: { id: string; courseType: string; coordinatorId: string; templateStatus: string }[]) {
  const ids = courses.map((c) => c.id);
  const out = new Map<string, ProgressStep[]>();
  if (!ids.length) return out;
  const [clos, rows, instruments, paperItems, coordinators] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: { in: ids }, source: "SE" }, select: { id: true, courseId: true, code: true, mappedPloId: true, mappedPlo: { select: { number: true } } } }),
    prisma.lectureRow.findMany({ where: { courseId: { in: ids }, source: "SE" }, select: { courseId: true, cloId: true, weightPct: true, topic: true, instrumentLinks: { select: { instrumentId: true } } } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: ids }, source: "SE" }, select: { courseId: true } }),
    prisma.paperDistributionItem.findMany({ where: { courseId: { in: ids }, source: "SE" }, select: { courseId: true, examType: true } }),
    prisma.user.findMany({ where: { id: { in: Array.from(new Set(courses.map((c) => c.coordinatorId))) } }, select: { id: true, managedById: true } }),
  ]);
  const chairOf = new Map(coordinators.map((u) => [u.id, u.managedById]));
  const chairIds = Array.from(new Set(coordinators.map((u) => u.managedById).filter((x): x is string => !!x)));
  const policies = chairIds.length ? await prisma.weightPolicy.findMany({ where: { chairmanId: { in: chairIds } } }) : [];
  for (const c of courses) {
    const chair = chairOf.get(c.coordinatorId);
    const policy = policies.find((p) => p.chairmanId === chair && p.courseType === normalizeCourseType(c.courseType)) || null;
    const rules = coverageRules(policy as unknown as Record<string, unknown>);
    const cClos = clos.filter((x) => x.courseId === c.id);
    const cRows = rows.filter((x) => x.courseId === c.id);
    const cov = evaluateCoverage(rules, {
      clos: cClos.map((x) => ({ id: x.id, code: x.code, mappedPloId: x.mappedPloId, ploNumber: x.mappedPlo?.number ?? null })),
      rows: cRows.map((r) => ({ cloId: r.cloId, weightPct: r.weightPct, topic: r.topic, instrumentIds: r.instrumentLinks.map((l) => l.instrumentId) })),
    });
    const cPaper = paperItems.filter((p) => p.courseId === c.id);
    out.set(c.id, buildSeProgress({
      cloCount: cClos.length,
      lectureCount: teachingLectureCounts(cRows).lectureCount,
      instrumentCount: instruments.filter((i) => i.courseId === c.id).length,
      topicShort: cov.topicShort, assessShort: cov.assessShort,
      midtermPaperCount: cPaper.filter((p) => p.examType === "Midterm").length,
      finalPaperCount: cPaper.filter((p) => p.examType === "Final").length,
      templateStatus: c.templateStatus,
    }));
  }
  return out;
}
