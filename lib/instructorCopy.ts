import { randomUUID } from "crypto";
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
  // A plan with no CLOs leaves no INSTRUCTOR CLOs behind, so the lecture rows tell too (copying them again would fail).
  if (await prisma.lectureRow.count({ where: { courseId, source: "INSTRUCTOR" } })) return;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return;

  const [seClos, seLectureRows, seInstruments] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "SE" } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "SE" } }),
  ]);

  // Ids made here so everything goes in with a few bulk inserts (fast enough to run for a whole semester at offer time).
  const cloIdMap: Record<string, string> = Object.fromEntries(seClos.map((c) => [c.id, randomUUID()]));
  const instrumentIdMap: Record<string, string> = Object.fromEntries(seInstruments.map((i) => [i.id, randomUUID()]));
  const rowIdMap: Record<string, string> = Object.fromEntries(seLectureRows.map((r) => [r.id, randomUUID()]));
  const links = seLectureRows.length ? await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: { in: seLectureRows.map((r) => r.id) } } }) : [];
  await prisma.$transaction([
    prisma.cLO.createMany({ data: seClos.map((c) => ({
      id: cloIdMap[c.id], courseId, source: "INSTRUCTOR", code: c.code, statement: c.statement, bloomLevel: c.bloomLevel,
      mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct, orderIndex: c.orderIndex, targetPct: c.targetPct, ploMappingSource: c.ploMappingSource,
    })) }),
    prisma.assessmentInstrument.createMany({ data: seInstruments.map((i) => ({ id: instrumentIdMap[i.id], courseId, source: "INSTRUCTOR", type: i.type, label: i.label, marksPct: i.marksPct, maxScore: i.maxScore, cloId: i.cloId ? cloIdMap[i.cloId] || null : null, partOfId: i.partOfId ? instrumentIdMap[i.partOfId] || null : null })) }),
    prisma.lectureRow.createMany({ data: seLectureRows.map((r) => ({
      id: rowIdMap[r.id], courseId, source: "INSTRUCTOR", week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
      cloId: r.cloId ? cloIdMap[r.cloId] || null : null, bloomLevel: r.bloomLevel, weightPct: r.weightPct, teachingMethod: r.teachingMethod, teachingMaterials: r.teachingMaterials,
    })) }),
    prisma.lectureRowInstrument.createMany({ data: links.filter((l) => instrumentIdMap[l.instrumentId]).map((l) => ({ lectureRowId: rowIdMap[l.lectureRowId], instrumentId: instrumentIdMap[l.instrumentId] })), skipDuplicates: true }),
  ]);

  await prisma.course.update({
    where: { id: courseId },
    data: {
      instructorAssignmentPct: course.assignmentPct, instructorQuizPct: course.quizPct, instructorProjectPct: course.projectPct,
      instructorLabPct: course.labPct, instructorMidtermPct: course.midtermPct, instructorFinalPct: course.finalPct,
    },
  });
}

/** "Refresh from SE plan": throw away the Instructor's copy and copy the SE plan again — only while teaching has not started
 * (no marks, no attendance, no lecture marked as held). Returns an error message when it is too late. */
export async function refreshInstructorCopy(courseId: string): Promise<string | null> {
  const [marks, att, held] = await Promise.all([
    prisma.studentMark.count({ where: { courseId } }),
    prisma.attendanceRecord.count({ where: { courseId } }),
    prisma.lectureRow.count({ where: { courseId, source: "INSTRUCTOR", actualDate: { not: null } } }),
  ]);
  if (marks || att || held) return "Teaching has already started (marks, attendance or held lectures exist), so the plan can no longer be replaced. Edit it tab by tab instead.";
  await prisma.$transaction([
    prisma.paperDistributionItem.deleteMany({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId, source: "INSTRUCTOR" } } }),
    prisma.lectureRow.deleteMany({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.assessmentInstrument.deleteMany({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.cLO.deleteMany({ where: { courseId, source: "INSTRUCTOR" } }),
  ]);
  await ensureInstructorCopy(courseId);
  return null;
}
