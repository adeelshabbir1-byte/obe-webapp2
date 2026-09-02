import { prisma } from "./db";

/**
 * On first visit, an Instructor's delivery pages are pre-filled from the
 * Subject Expert's plan (source="SE") as their own editable copy
 * (source="INSTRUCTOR"). Only runs once — if INSTRUCTOR rows already exist,
 * does nothing.
 */
export async function ensureInstructorCopy(courseId: string) {
  const existingCount = await prisma.cLO.count({ where: { courseId, source: "INSTRUCTOR" } });
  if (existingCount > 0) return; // already copied

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return;

  const [seClos, seLectureRows, seInstruments] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "SE" } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "SE" } }),
  ]);

  const cloIdMap: Record<string, string> = {};
  for (const c of seClos) {
    const created = await prisma.cLO.create({
      data: {
        courseId, source: "INSTRUCTOR", code: c.code, statement: c.statement, bloomLevel: c.bloomLevel,
        mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct,
      },
    });
    cloIdMap[c.id] = created.id;
  }

  const instrumentIdMap: Record<string, string> = {};
  for (const i of seInstruments) {
    const created = await prisma.assessmentInstrument.create({
      data: { courseId, source: "INSTRUCTOR", type: i.type, label: i.label, marksPct: i.marksPct },
    });
    instrumentIdMap[i.id] = created.id;
  }

  for (const r of seLectureRows) {
    const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: r.id } });
    const newRow = await prisma.lectureRow.create({
      data: {
        courseId, source: "INSTRUCTOR", week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
        cloId: r.cloId ? cloIdMap[r.cloId] || null : null, bloomLevel: r.bloomLevel, weightPct: r.weightPct,
      },
    });
    for (const link of links) {
      const newInstrumentId = instrumentIdMap[link.instrumentId];
      if (newInstrumentId) await prisma.lectureRowInstrument.create({ data: { lectureRowId: newRow.id, instrumentId: newInstrumentId } });
    }
  }

  await prisma.course.update({
    where: { id: courseId },
    data: {
      instructorAssignmentPct: course.assignmentPct, instructorQuizPct: course.quizPct, instructorProjectPct: course.projectPct,
      instructorLabPct: course.labPct, instructorMidtermPct: course.midtermPct, instructorFinalPct: course.finalPct,
    },
  });
}
