import { prisma } from "./db";
import { deleteCourseCompletely } from "./deleteCourseCompletely";

/** Deletes a batch and everything under it — every course (with all of
 * ITS dependents, via deleteCourseCompletely), every student (and their
 * survey responses / transcript records), every PLO, and the batch's own
 * schedule config — so a Coordinator can genuinely start over rather than
 * accumulate orphaned data. */
export async function deleteBatchCompletely(batchId: string) {
  const courseIds = (await prisma.course.findMany({ where: { batchId }, select: { id: true } })).map((c) => c.id);
  for (const courseId of courseIds) {
    await deleteCourseCompletely(courseId);
  }

  const studentIds = (await prisma.student.findMany({ where: { batchId }, select: { id: true } })).map((s) => s.id);
  // Elective Slot Groups (the batch's "Elective Options" — e.g. "Elective-I")
  // have a required, non-cascading FK to Batch, and their Options/Choices
  // in turn reference this batch's own Students. Without deleting these
  // first, prisma.batch.delete() (and even the Student delete above it)
  // throws a foreign-key constraint error that silently rolls back the
  // ENTIRE transaction — the batch looked like it was "not deleting" with
  // no visible reason, because nothing in this list actually ran.
  const electiveGroupIds = (await prisma.electiveSlotGroup.findMany({ where: { batchId }, select: { id: true } })).map((g) => g.id);

  await prisma.$transaction([
    prisma.electiveChoice.deleteMany({ where: { groupId: { in: electiveGroupIds } } }),
    prisma.electiveSlotOption.deleteMany({ where: { groupId: { in: electiveGroupIds } } }),
    prisma.electiveSlotGroup.deleteMany({ where: { batchId } }),
    prisma.surveyResponse.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.studentTranscriptRecord.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.student.deleteMany({ where: { batchId } }),
    prisma.pLO.deleteMany({ where: { batchId } }),
    prisma.cqiRecord.updateMany({ where: { batchId }, data: { batchId: null } }),
    prisma.batchScheduleConfig.deleteMany({ where: { batchId } }),
    prisma.batch.delete({ where: { id: batchId } }),
  ]);
}
