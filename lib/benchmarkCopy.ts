import { prisma } from "./db";

/**
 * Finds the most recent prior course (any earlier batch, same coordinator)
 * that matches by masterCourseId (for HEC-imported courses) or by code
 * (for manual courses), and that actually has Subject Expert work on it
 * (at least one CLO) worth inheriting.
 */
async function findBenchmarkSource(coordinatorId: string, newCourseId: string, masterCourseId: string | null, code: string) {
  const where = masterCourseId
    ? { coordinatorId, masterCourseId, NOT: { id: newCourseId } }
    : { coordinatorId, code, NOT: { id: newCourseId } };

  const candidates = await prisma.course.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { clos: true },
  });

  return candidates.find((c) => c.clos.length > 0) || null;
}

/**
 * Copies CLOs (with PLO mapping + contribution %), the PLO–Course matrix
 * assignment, the lecture schedule, and assessment weights from a prior
 * batch's course into a freshly created one. The new course keeps its own
 * templateStatus ('draft') — it still needs its own OMC review — but the
 * Subject Expert starts from a filled-in template instead of a blank one.
 */
export async function copyBenchmarkIfAvailable(newCourseId: string, coordinatorId: string, masterCourseId: string | null, code: string) {
  const source = await findBenchmarkSource(coordinatorId, newCourseId, masterCourseId, code);
  if (!source) return null;

  const [ploMappings, clos, lectureRows] = await Promise.all([
    prisma.coursePloMapping.findMany({ where: { courseId: source.id } }),
    prisma.cLO.findMany({ where: { courseId: source.id } }),
    prisma.lectureRow.findMany({ where: { courseId: source.id } }),
  ]);

  for (const m of ploMappings) {
    await prisma.coursePloMapping.create({ data: { courseId: newCourseId, ploId: m.ploId, assignedById: m.assignedById } }).catch(() => {});
  }

  const cloIdMap: Record<string, string> = {};
  for (const c of clos) {
    const created = await prisma.cLO.create({
      data: {
        courseId: newCourseId, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel,
        mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct,
      },
    });
    cloIdMap[c.id] = created.id;
  }

  for (const r of lectureRows) {
    await prisma.lectureRow.create({
      data: {
        courseId: newCourseId, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
        cloId: r.cloId ? cloIdMap[r.cloId] || null : null, bloomLevel: r.bloomLevel, weightPct: r.weightPct,
      },
    });
  }

  await prisma.course.update({
    where: { id: newCourseId },
    data: {
      assignmentPct: source.assignmentPct, quizPct: source.quizPct, projectPct: source.projectPct,
      labPct: source.labPct, midtermPct: source.midtermPct, finalPct: source.finalPct,
      benchmarkSourceId: source.id,
    },
  });

  return { sourceCourseId: source.id, cloCount: clos.length, lectureRowCount: lectureRows.length };
}
