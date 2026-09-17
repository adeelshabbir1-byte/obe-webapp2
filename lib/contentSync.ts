import { prisma } from "./db";
import { copyCourseContent } from "./benchmarkCopy";

/**
 * Call this at the end of any Subject Expert action that changes a
 * course's content (CLOs, PLO mappings, weekly lecture plan, assessment
 * instruments, textbook/description fields, or assessment weight %s).
 *
 * If the course is a member of a CourseContentSyncGroup, its content is
 * copied onto every OTHER member automatically — replacing what they
 * had, per the chairman's instruction that this should be a clean,
 * immediate propagation rather than a merge.
 *
 * Silently does nothing if the course isn't in a sync group, so it's
 * safe to call unconditionally after every content-mutating endpoint —
 * no need for each call site to check membership first.
 *
 * A course with graded student marks is skipped as a SYNC TARGET (never
 * as a source) for the same reason the manual import blocks it: wiping
 * instruments on an already-graded course would destroy real grades.
 * That target is reported back, not silently dropped, so the caller can
 * surface it if useful.
 */
export async function syncCourseContentToLinkedCourses(sourceCourseId: string) {
  const membership = await prisma.courseContentSyncMember.findUnique({
    where: { courseId: sourceCourseId },
    include: { group: { include: { members: true } } },
  });
  if (!membership) return { synced: [], skippedGraded: [] };

  const otherCourseIds = membership.group.members.map((m) => m.courseId).filter((id) => id !== sourceCourseId);
  if (otherCourseIds.length === 0) return { synced: [], skippedGraded: [] };

  const gradedCounts = await prisma.studentMark.groupBy({
    by: ["courseId"], where: { courseId: { in: otherCourseIds } }, _count: { id: true },
  });
  const gradedCourseIds = new Set(gradedCounts.map((g) => g.courseId));

  const synced: string[] = [];
  const skippedGraded: string[] = [];

  for (const targetId of otherCourseIds) {
    if (gradedCourseIds.has(targetId)) { skippedGraded.push(targetId); continue; }

    await prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: targetId } } });
    await prisma.paperDistributionItem.deleteMany({ where: { courseId: targetId } });
    await prisma.lectureRow.deleteMany({ where: { courseId: targetId } });
    await prisma.assessmentInstrument.deleteMany({ where: { courseId: targetId } });
    await prisma.cLO.deleteMany({ where: { courseId: targetId } });
    await prisma.coursePloMapping.deleteMany({ where: { courseId: targetId } });

    await copyCourseContent(sourceCourseId, targetId);
    synced.push(targetId);
  }

  return { synced, skippedGraded };
}
