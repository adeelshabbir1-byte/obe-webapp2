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

export async function getBenchmarkCandidates(coordinatorId: string) {
  return fetchCandidates(coordinatorId);
}

/**
 * Copies a specific known source course's SE work (CLOs, PLO mapping,
 * contribution %, lecture schedule, weights) into a specific known new
 * course — the shared engine behind both automatic benchmark matching and
 * the explicit "copy this whole batch into a new batch" flow.
 */
export async function copyCourseContent(sourceCourseId: string, newCourseId: string) {
  const [source, newCourse] = await Promise.all([
    prisma.course.findUnique({ where: { id: sourceCourseId } }),
    prisma.course.findUnique({ where: { id: newCourseId } }),
  ]);
  if (!source || !newCourse) return null;

  const [ploMappings, clos, lectureRows] = await Promise.all([
    prisma.coursePloMapping.findMany({ where: { courseId: source.id }, include: { plo: true } }),
    prisma.cLO.findMany({ where: { courseId: source.id }, include: { mappedPlo: true } }),
    prisma.lectureRow.findMany({ where: { courseId: source.id } }),
  ]);

  // PLOs are scoped per BATCH, so a PLO id from the source course's batch is
  // meaningless in the new course's batch — translate by PLO NUMBER into
  // whichever PLO (if any) already exists with that number in the new batch.
  const neededNumbers = new Set<number>([
    ...ploMappings.map((m) => m.plo.number),
    ...clos.filter((c) => c.mappedPlo).map((c) => c.mappedPlo!.number),
  ]);
  const targetPlos = newCourse.batchId
    ? await prisma.pLO.findMany({ where: { batchId: newCourse.batchId, number: { in: Array.from(neededNumbers) } } })
    : [];
  const targetPloByNumber = new Map(targetPlos.map((p) => [p.number, p]));

  const translatedMappings = ploMappings
    .map((m) => targetPloByNumber.get(m.plo.number))
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (translatedMappings.length > 0) {
    await prisma.coursePloMapping.createMany({
      data: translatedMappings.map((p) => ({ courseId: newCourseId, ploId: p.id, assignedById: source.coordinatorId })),
      skipDuplicates: true,
    });
  }

  const cloIdMap: Record<string, string> = {};
  for (const c of clos) {
    const translatedPlo = c.mappedPlo ? targetPloByNumber.get(c.mappedPlo.number) : null;
    const created = await prisma.cLO.create({
      data: {
        courseId: newCourseId, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel,
        mappedPloId: translatedPlo?.id || null, ploContributionPct: translatedPlo ? c.ploContributionPct : null,
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

  return { cloCount: clos.length, lectureRowCount: lectureRows.length };
}

/**
 * Finds the most recent prior course (any earlier batch, same coordinator)
 * that matches by masterCourseId (for HEC-imported courses) or by code
 * (for manual courses), with actual Subject Expert work worth inheriting,
 * and copies its content into the freshly created course.
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

  const result = await copyCourseContent(source.id, newCourseId);
  return result ? { sourceCourseId: source.id, ...result } : null;
}
