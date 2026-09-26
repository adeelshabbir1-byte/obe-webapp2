import { prisma } from "./db";
import { randomUUID } from "crypto";

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
 * Fallback for when no benchmark match exists: seeds the new course's SE-side
 * CLOs and 32-lecture topic draft directly from HEC's MasterCourseClo /
 * MasterCourseTopic content (if any exists for this master course). Only
 * called when copyBenchmarkIfAvailable found nothing — a benchmark from a
 * real prior batch's actual work always takes priority over this seed.
 */
export async function seedFromMasterCourseIfAvailable(newCourseId: string, masterCourseId: string | null) {
  if (!masterCourseId) return null;

  const [masterCourse, seedClos, seedTopics] = await Promise.all([
    prisma.masterCourse.findUnique({ where: { id: masterCourseId } }),
    prisma.masterCourseClo.findMany({ where: { masterCourseId }, orderBy: { orderIndex: "asc" } }),
    prisma.masterCourseTopic.findMany({ where: { masterCourseId }, orderBy: { lectureNumber: "asc" } }),
  ]);

  // Textbook/description/reference flow from the template regardless of
  // whether there are any seed CLOs/topics to go with them — a course can
  // have HEC-suggested reading material even with no CLO draft yet.
  if (masterCourse && (masterCourse.textbook || masterCourse.catalogDescription || masterCourse.referenceMaterial)) {
    const newCourse = await prisma.course.findUnique({ where: { id: newCourseId } });
    if (newCourse) {
      await prisma.course.update({
        where: { id: newCourseId },
        data: {
          textbook: newCourse.textbook ?? masterCourse.textbook,
          catalogDescription: newCourse.catalogDescription ?? masterCourse.catalogDescription,
          referenceMaterial: newCourse.referenceMaterial ?? masterCourse.referenceMaterial,
        },
      });
    }
  }

  if (seedClos.length === 0 && seedTopics.length === 0) return null;

  for (const [i, c] of seedClos.entries()) {
    await prisma.cLO.create({
      data: { courseId: newCourseId, source: "SE", code: `CLO-${i + 1}`, statement: c.statement, bloomLevel: c.bloomLevel },
    });
  }

  if (seedTopics.length > 0) {
    // Fill in a full 32-row template — Week/Lecture# fixed as usual — using
    // the seeded topic for whichever lecture numbers we have content for.
    const topicByLecture = new Map(seedTopics.map((t) => [t.lectureNumber, t.topic]));
    await prisma.lectureRow.createMany({
      data: Array.from({ length: 32 }, (_, i) => ({
        courseId: newCourseId, source: "SE", lectureNumber: i + 1, week: Math.ceil((i + 1) / 2),
        topic: topicByLecture.get(i + 1) || "", subtopic: null, cloId: null, bloomLevel: null, weightPct: 0,
      })),
    });
  }

  return { cloCount: seedClos.length, topicCount: seedTopics.length };
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

  const [ploMappings, clos, lectureRows, instruments, paperItems] = await Promise.all([
    prisma.coursePloMapping.findMany({ where: { courseId: source.id }, include: { plo: true } }),
    prisma.cLO.findMany({ where: { courseId: source.id }, include: { mappedPlo: true }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId: source.id }, include: { instrumentLinks: true } }),
    // Only the Subject Expert's own template instruments — anything an
    // instructor added themselves for their own section shouldn't be
    // copied into a different course as if it were shared content.
    prisma.assessmentInstrument.findMany({ where: { courseId: source.id, source: "SE" } }),
    prisma.paperDistributionItem.findMany({ where: { courseId: source.id, source: "SE" }, orderBy: { orderIndex: "asc" } }),
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
    .map((m) => { const targetPlo = targetPloByNumber.get(m.plo.number); return targetPlo ? { targetPlo, source: m.source } : null; })
    .filter((x): x is { targetPlo: NonNullable<ReturnType<typeof targetPloByNumber.get>>; source: string | null } => !!x);
  if (translatedMappings.length > 0) {
    await prisma.coursePloMapping.createMany({
      data: translatedMappings.map((m) => ({ courseId: newCourseId, ploId: m.targetPlo.id, assignedById: source.coordinatorId, source: m.source })),
      skipDuplicates: true,
    });
  }

  // Every id is generated up front (instead of relying on the DB's
  // default and reading it back one row at a time) specifically so every
  // table can be inserted with ONE createMany call instead of N
  // sequential creates — this used to be the actual bottleneck making
  // every single SE save on a linked course noticeably slower, since
  // the whole sync ran synchronously inside that save's request.
  const instrumentIdMap: Record<string, string> = {};
  for (const inst of instruments) instrumentIdMap[inst.id] = randomUUID();
  if (instruments.length > 0) {
    await prisma.assessmentInstrument.createMany({
      data: instruments.map((inst) => ({
        id: instrumentIdMap[inst.id], courseId: newCourseId, source: "SE",
        type: inst.type, label: inst.label, marksPct: inst.marksPct, maxScore: inst.maxScore,
      })),
    });
  }

  const cloIdMap: Record<string, string> = {};
  for (const c of clos) cloIdMap[c.id] = randomUUID();
  if (clos.length > 0) {
    await prisma.cLO.createMany({
      data: clos.map((c) => {
        const translatedPlo = c.mappedPlo ? targetPloByNumber.get(c.mappedPlo.number) : null;
        return {
          id: cloIdMap[c.id], courseId: newCourseId, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel,
          orderIndex: c.orderIndex, targetPct: c.targetPct,
          mappedPloId: translatedPlo?.id || null, ploContributionPct: translatedPlo ? c.ploContributionPct : null,
        };
      }),
    });
  }

  const lectureRowIdMap: Record<string, string> = {};
  for (const r of lectureRows) lectureRowIdMap[r.id] = randomUUID();
  if (lectureRows.length > 0) {
    await prisma.lectureRow.createMany({
      data: lectureRows.map((r) => ({
        id: lectureRowIdMap[r.id], courseId: newCourseId, week: r.week, lectureNumber: r.lectureNumber,
        topic: r.topic, subtopic: r.subtopic, cloId: r.cloId ? cloIdMap[r.cloId] || null : null,
        bloomLevel: r.bloomLevel, weightPct: r.weightPct,
      })),
    });
  }

  const instrumentLinkRows = lectureRows.flatMap((r) =>
    r.instrumentLinks
      .map((l) => instrumentIdMap[l.instrumentId])
      .filter((id): id is string => !!id)
      .map((instrumentId) => ({ lectureRowId: lectureRowIdMap[r.id], instrumentId }))
  );
  if (instrumentLinkRows.length > 0) {
    await prisma.lectureRowInstrument.createMany({ data: instrumentLinkRows });
  }

  if (paperItems.length > 0) {
    await prisma.paperDistributionItem.createMany({
      data: paperItems.map((p) => ({
        courseId: newCourseId, source: "SE", questionNo: p.questionNo, topicText: p.topicText,
        cognitiveLevel: p.cognitiveLevel, marks: p.marks, orderIndex: p.orderIndex,
        lectureRowId: p.lectureRowId ? lectureRowIdMap[p.lectureRowId] || null : null,
        cloId: p.cloId ? cloIdMap[p.cloId] || null : null,
      })),
    });
  }

  await prisma.course.update({
    where: { id: newCourseId },
    data: {
      assignmentPct: source.assignmentPct, quizPct: source.quizPct, projectPct: source.projectPct,
      labPct: source.labPct, midtermPct: source.midtermPct, finalPct: source.finalPct,
      benchmarkSourceId: source.id,
      // Only fill these in if the new course doesn't already have its own
      // — a benchmark shouldn't clobber content someone already typed.
      textbook: newCourse.textbook ?? source.textbook,
      catalogDescription: newCourse.catalogDescription ?? source.catalogDescription,
      referenceMaterial: newCourse.referenceMaterial ?? source.referenceMaterial,
    },
  });

  return { cloCount: clos.length, lectureRowCount: lectureRows.length, instrumentCount: instruments.length, paperItemCount: paperItems.length };
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

/**
 * Called at OFFERING time (not course-creation time) — finds the best prior
 * occurrence of this same course to carry settings forward from, preferring
 * a match on the SAME term type (this Fall from last Fall, this Spring from
 * last Spring) over the most recent occurrence of any term type. Auto-assigns
 * the matched instructor, and fills in content if the course has none yet.
 */
export async function carryOverFromMatchingSemester(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !course.offeredTermName) return null;

  const allPriorOfferings = await prisma.course.findMany({
    where: {
      coordinatorId: course.coordinatorId,
      id: { not: courseId },
      isOffered: true,
      OR: course.masterCourseId ? [{ masterCourseId: course.masterCourseId }] : [{ code: course.code }],
    },
    orderBy: [{ offeredTermYear: "desc" }],
  });
  if (allPriorOfferings.length === 0) return null;

  // Prefer same term-type (Fall<-Fall, Spring<-Spring); otherwise the most recent of any type.
  const sameTermMatch = allPriorOfferings.find((c) => c.offeredTermName === course.offeredTermName);
  const match = sameTermMatch || allPriorOfferings[0];

  const updates: any = {};
  if (!course.instructorId && match.instructorId) updates.instructorId = match.instructorId;

  if (Object.keys(updates).length > 0) await prisma.course.update({ where: { id: course.id }, data: updates });

  const existingClos = await prisma.cLO.count({ where: { courseId: course.id, source: "SE" } });
  let contentCopied = false;
  if (existingClos === 0) {
    const result = await copyCourseContent(match.id, course.id);
    contentCopied = !!result;
  }

  return {
    matchedCourseId: match.id, matchedTerm: `${match.offeredTermName} ${match.offeredTermYear}`,
    sameTermType: !!sameTermMatch, instructorCarriedOver: !!updates.instructorId, contentCopied,
  };
}
