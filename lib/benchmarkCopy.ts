import { prisma } from "./db";

type CandidateCourse = Awaited<ReturnType<typeof fetchCandidates>>[number];

/**
 * Fetches every existing course for this coordinator that has at least one
 * CLO (i.e. is worth using as a benchmark), ONCE — so a bulk import of many
 * courses doesn't run a separate database query per course to check for a
 * benchmark (that N+1 pattern was slow enough to time out a 44-course import).
 */
async function fetchCandidates(coordinatorId: string) {
  const courses = await prisma.course.findMany({
    where: { coordinatorId },
    orderBy: { createdAt: "desc" },
    include: { clos: { select: { id: true } } },
  });
  return courses.filter((c) => c.clos.length > 0);
}

function findBenchmarkSource(candidates: CandidateCourse[], newCourseId: string, masterCourseId: string | null, code: string) {
  return candidates.find((c) =>
    c.id !== newCourseId && (masterCourseId ? c.masterCourseId === masterCourseId : c.code === code)
  ) || null;
}

/**
 * Copies CLOs (with PLO mapping + contribution %), the PLO–Course matrix
 * assignment, the lecture schedule, and assessment weights from a prior
 * batch's course into a freshly created one. The new course keeps its own
 * templateStatus ('draft') — it still needs its own OMC review — but the
 * Subject Expert starts from a filled-in template instead of a blank one.
 *
 * `candidates` should be fetched ONCE via getBenchmarkCandidates() before a
 * loop of many course creations, not re-fetched per course.
 */
export async function copyBenchmarkIfAvailable(
  newCourseId: string, coordinatorId: string, masterCourseId: string | null, code: string,
  candidates?: CandidateCourse[]
) {
  const pool = candidates ?? (await fetchCandidates(coordinatorId));
  const source = findBenchmarkSource(pool, newCourseId, masterCourseId, code);
  if (!source) return null;

  const [ploMappings, clos, lectureRows] = await Promise.all([
    prisma.coursePloMapping.findMany({ where: { courseId: source.id } }),
    prisma.cLO.findMany({ where: { courseId: source.id } }),
    prisma.lectureRow.findMany({ where: { courseId: source.id } }),
  ]);

  if (ploMappings.length > 0) {
    await prisma.coursePloMapping.createMany({
      data: ploMappings.map((m) => ({ courseId: newCourseId, ploId: m.ploId, assignedById: m.assignedById })),
      skipDuplicates: true,
    });
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

  if (lectureRows.length > 0) {
    await prisma.lectureRow.createMany({
      data: lectureRows.map((r) => ({
        courseId: newCourseId, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
        cloId: r.cloId ? cloIdMap[r.cloId] || null : null, bloomLevel: r.bloomLevel, weightPct: r.weightPct,
      })),
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

export async function getBenchmarkCandidates(coordinatorId: string) {
  return fetchCandidates(coordinatorId);
}
