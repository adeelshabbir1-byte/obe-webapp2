import { prisma } from "./db";

/** Deletes a batch and everything under it — every course (and all of
 * ITS dependents), every student (and their dependents), every PLO, and
 * the batch's own schedule config — so a Coordinator can genuinely start
 * over rather than accumulate orphaned data.
 *
 * This does NOT call deleteCourseCompletely() in a per-course loop. That
 * used to run a full ~20-query transaction for EVERY course in the batch
 * one at a time — fine for deleting a single course, but for a whole
 * batch it meant dozens of sequential round trips, which on a serverless
 * function (Vercel's actual cap is often 10s even when this route
 * declares a 60s maxDuration, depending on plan) could get killed
 * partway through. Each course transaction commits on its own, so a
 * killed request left SOME courses deleted and others not — "the number
 * of courses keeps going down every time I click Delete, but the batch
 * never actually goes away" is exactly that: a timeout, not a leftover
 * foreign key, repeatedly making partial, non-atomic progress.
 *
 * Instead, every dependent table is cleaned up with ONE bulk deleteMany
 * across ALL of this batch's course/student ids at once, so the total
 * round-trip count stays roughly constant regardless of how many courses
 * or students the batch has, and the whole thing runs as a single
 * transaction — it either fully succeeds or fully rolls back, so a
 * failure can never again leave the batch half-deleted. */
export async function deleteBatchCompletely(batchId: string) {
  const courseIds = (await prisma.course.findMany({ where: { batchId }, select: { id: true } })).map((c) => c.id);
  const studentIds = (await prisma.student.findMany({ where: { batchId }, select: { id: true } })).map((s) => s.id);
  const lectureRowIds = (await prisma.lectureRow.findMany({ where: { courseId: { in: courseIds } }, select: { id: true } })).map((r) => r.id);
  const scheduleSectionIds = (await prisma.scheduleSection.findMany({ where: { courseId: { in: courseIds } }, select: { id: true } })).map((s) => s.id);
  const electiveGroupIds = (await prisma.electiveSlotGroup.findMany({ where: { batchId }, select: { id: true } })).map((g) => g.id);

  // Content Sync bases: a course being deleted that's the BASE of its
  // sync group needs another member promoted (or the group cleaned up if
  // it was the last one) — same as the single-course path. Only courses
  // that are actually a base need this, which is normally a small subset,
  // so this stays a short loop rather than one per course in the batch.
  const baseMemberships = await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: courseIds }, isBase: true } });
  for (const membership of baseMemberships) {
    const otherMembers = await prisma.courseContentSyncMember.findMany({
      where: { groupId: membership.groupId, courseId: { notIn: courseIds } }, orderBy: { id: "asc" },
    });
    await prisma.courseContentSyncMember.delete({ where: { courseId: membership.courseId } });
    if (otherMembers.length > 0) {
      await prisma.courseContentSyncMember.update({ where: { id: otherMembers[0].id }, data: { isBase: true } });
    } else {
      await prisma.courseContentSyncGroup.delete({ where: { id: membership.groupId } }).catch(() => {});
    }
  }

  await prisma.$transaction([
    // --- Course-scoped dependents (bulk, by courseId IN courseIds) ---
    prisma.electiveChoice.deleteMany({ where: { option: { courseId: { in: courseIds } } } }),
    prisma.electiveSlotOption.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.outOfBatchRequest.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.degreePlanEntry.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.registrationApprovalRequest.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.attendanceRecord.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.paperDistributionItem.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: lectureRowIds } } }),
    prisma.timetableEntry.deleteMany({ where: { scheduleSectionId: { in: scheduleSectionIds } } }),
    prisma.studentMark.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.feedForwardNote.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.instructorGuidanceComment.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.courseGradeCutoff.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.coursePloMapping.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.weightExceptionRequest.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.courseSectionAssignment.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.studentEnrollment.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.courseEquivalenceMember.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.courseContentSyncMember.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.cqiRecord.updateMany({ where: { courseId: { in: courseIds } }, data: { courseId: null } }),
    prisma.course.updateMany({ where: { benchmarkSourceId: { in: courseIds } }, data: { benchmarkSourceId: null } }),
    prisma.course.updateMany({ where: { prerequisiteCourseId: { in: courseIds } }, data: { prerequisiteCourseId: null } }),
    prisma.scheduleSection.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.lectureRow.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.instrumentEvidence.deleteMany({ where: { instrument: { courseId: { in: courseIds } } } }),
    prisma.assessmentInstrument.deleteMany({ where: { courseId: { in: courseIds } } }),
    prisma.cLO.deleteMany({ where: { courseId: { in: courseIds } } }),

    // --- Elective Options (the batch's "Elective-I" etc.) ---
    prisma.electiveChoice.deleteMany({ where: { groupId: { in: electiveGroupIds } } }),
    prisma.electiveSlotOption.deleteMany({ where: { groupId: { in: electiveGroupIds } } }),
    prisma.electiveSlotGroup.deleteMany({ where: { batchId } }),

    // --- Student-scoped dependents (bulk, by studentId IN studentIds) ---
    // Scoped by student rather than by course too, since a student can
    // have records tied to a course OUTSIDE this batch (the Out-of-Batch
    // enrollment feature) that the course-scoped deletes above can't see.
    prisma.surveyResponse.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.studentTranscriptRecord.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.studentSession.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.attendanceRecord.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.studentMark.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.studentEnrollment.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.outOfBatchRequest.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.degreePlanEntry.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.registrationApprovalRequest.deleteMany({ where: { studentId: { in: studentIds } } }),

    // --- The courses, students, and finally the batch itself ---
    prisma.course.deleteMany({ where: { batchId } }),
    prisma.student.deleteMany({ where: { batchId } }),
    prisma.pLO.deleteMany({ where: { batchId } }),
    prisma.cqiRecord.updateMany({ where: { batchId }, data: { batchId: null } }),
    prisma.batchScheduleConfig.deleteMany({ where: { batchId } }),
    prisma.batch.delete({ where: { id: batchId } }),
  ]);
}
