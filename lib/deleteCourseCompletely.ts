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

  // A course can also be a Content Sync group's member — deleting it
  // outright would fail on that foreign key alone, exactly like the
  // benchmark/prerequisite back-references below. If it's the group's
  // BASE specifically, another member is promoted first (or the whole
  // group is cleaned up if it was the last one), same as manually
  // unlinking it through the UI — a course being deleted shouldn't
  // silently leave a group without a base for the others to inherit
  // from.
  const contentSyncMembership = await prisma.courseContentSyncMember.findUnique({ where: { courseId } });
  if (contentSyncMembership?.isBase) {
    const otherMembers = await prisma.courseContentSyncMember.findMany({ where: { groupId: contentSyncMembership.groupId, courseId: { not: courseId } }, orderBy: { id: "asc" } });
    // The old base's row is removed FIRST — promoting the new one before
    // that would mean two rows in the same group are both isBase=true
    // at once, which the one-base-per-group unique constraint rejects
    // immediately (Postgres checks it per-statement, not deferred to
    // commit).
    await prisma.courseContentSyncMember.delete({ where: { courseId } });
    if (otherMembers.length > 0) {
      await prisma.courseContentSyncMember.update({ where: { id: otherMembers[0].id }, data: { isBase: true } });
    } else {
      await prisma.courseContentSyncGroup.delete({ where: { id: contentSyncMembership.groupId } }).catch(() => {});
    }
  }

  await prisma.$transaction([
    // Leaf-level records referencing lecture rows / sections / instruments
    // A course can also be one option in an Elective Slot Group (e.g. one
    // choice under "Elective-I") — ElectiveSlotOption.courseId is a
    // required, unique, non-cascading FK, so any student choices for it
    // and the option row itself have to go before the course can be
    // deleted, or this fails on a foreign key violation the moment the
    // course is used as an elective option.
    prisma.electiveChoice.deleteMany({ where: { option: { courseId } } }),
    prisma.electiveSlotOption.deleteMany({ where: { courseId } }),
    // Three more required, non-cascading FKs to Course that weren't
    // covered before — any row left behind in these on a course a
    // student has requested/registered against blocks the delete just
    // like the elective ones above.
    prisma.outOfBatchRequest.deleteMany({ where: { courseId } }),
    prisma.degreePlanEntry.deleteMany({ where: { courseId } }),
    prisma.registrationApprovalRequest.deleteMany({ where: { courseId } }),
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
    prisma.courseContentSyncMember.deleteMany({ where: { courseId } }),
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
