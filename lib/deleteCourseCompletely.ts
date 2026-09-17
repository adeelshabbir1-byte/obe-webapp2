import { prisma } from "./db";

/** Deletes a course and every record that depends on it, in dependency
 * order (deepest first) — there are no cascade deletes set up in the
 * schema, so a plain `course.delete()` would fail on a foreign key
 * violation the moment any related data exists. CqiRecord.courseId is
 * nullable, so history there is preserved (courseId cleared) rather than
 * deleted outright. */
export async function deleteCourseCompletely(courseId: string) {
  const lectureRowIds = (await prisma.lectureRow.findMany({ where: { courseId }, select: { id: true } })).map((r) => r.id);
  const scheduleSectionIds = (await prisma.scheduleSection.findMany({ where: { courseId }, select: { id: true } })).map((s) => s.id);

  await prisma.$transaction([
    // Leaf-level records referencing lecture rows / sections / instruments
    prisma.attendanceRecord.deleteMany({ where: { courseId } }),
    prisma.paperDistributionItem.deleteMany({ where: { courseId } }),
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: lectureRowIds } } }),
    prisma.timetableEntry.deleteMany({ where: { scheduleSectionId: { in: scheduleSectionIds } } }),
    prisma.studentMark.deleteMany({ where: { courseId } }),
    prisma.feedForwardNote.deleteMany({ where: { courseId } }),
    prisma.instructorGuidanceComment.deleteMany({ where: { courseId } }),
    prisma.courseGradeCutoff.deleteMany({ where: { courseId } }),
    prisma.coursePloMapping.deleteMany({ where: { courseId } }),
    prisma.weightExceptionRequest.deleteMany({ where: { courseId } }),
    prisma.courseSectionAssignment.deleteMany({ where: { courseId } }),
    prisma.studentEnrollment.deleteMany({ where: { courseId } }),
    prisma.courseEquivalenceMember.deleteMany({ where: { courseId } }),
    // Preserve CQI history rather than deleting it outright.
    prisma.cqiRecord.updateMany({ where: { courseId }, data: { courseId: null } }),
    // Other courses can point BACK at this one (as their benchmark
    // source, or as their prerequisite) — those references have to be
    // cleared before this course can be deleted, or the delete fails on
    // a foreign key violation the moment either link exists.
    prisma.course.updateMany({ where: { benchmarkSourceId: courseId }, data: { benchmarkSourceId: null } }),
    prisma.course.updateMany({ where: { prerequisiteCourseId: courseId }, data: { prerequisiteCourseId: null } }),
    // Mid-level: things that reference lecture rows / CLOs / instruments directly
    prisma.scheduleSection.deleteMany({ where: { courseId } }),
    prisma.lectureRow.deleteMany({ where: { courseId } }),
    prisma.assessmentInstrument.deleteMany({ where: { courseId } }),
    prisma.cLO.deleteMany({ where: { courseId } }),
    // Finally, the course itself
    prisma.course.delete({ where: { id: courseId } }),
  ]);
}
