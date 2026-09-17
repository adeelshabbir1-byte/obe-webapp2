import { prisma } from "./db";
import { copyCourseContent } from "./benchmarkCopy";

const DEGREE_PRIORITY = ["computer science", "software engineering", "artificial intelligence", "cyber", "data science"];
function degreePriorityRank(degreeProgram: string | null | undefined): number {
  const lower = (degreeProgram || "").toLowerCase();
  const i = DEGREE_PRIORITY.findIndex((d) => lower.includes(d));
  return i === -1 ? DEGREE_PRIORITY.length : i;
}
function termIndex(term: string | null | undefined, year: number | null | undefined): number {
  if (!term || !year) return Infinity; // unset term/year sorts last — never treated as "most senior"
  return term === "Spring" ? year * 2 - 1 : year * 2;
}

/**
 * Decides which of two courses should be the content-sync BASE, per the
 * chairman's fixed rule: the course from the more senior batch (earlier
 * startTerm/startYear) wins; if both batches started in the same term,
 * fall back to degree-program priority (Computer Science > Software
 * Engineering > Artificial Intelligence > Cyber Security > Data
 * Science). This is deterministic — not based on which one happens to
 * have content already.
 */
export async function determineBaseCourseId(courseIdA: string, courseIdB: string): Promise<string> {
  const [courseA, courseB] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseIdA }, include: { batch: true } }),
    prisma.course.findUnique({ where: { id: courseIdB }, include: { batch: true } }),
  ]);
  const termA = termIndex(courseA?.batch?.startTerm, courseA?.batch?.startYear);
  const termB = termIndex(courseB?.batch?.startTerm, courseB?.batch?.startYear);
  if (termA !== termB) return termA < termB ? courseIdA : courseIdB; // earlier start = more senior

  const rankA = degreePriorityRank(courseA?.batch?.degreeProgram);
  const rankB = degreePriorityRank(courseB?.batch?.degreeProgram);
  return rankA <= rankB ? courseIdA : courseIdB;
}

/**
 * Returns an error message if this course is a non-base member of a
 * content-sync group — meaning it inherits its content from another
 * course and shouldn't be edited directly. Returns null if the course
 * is fine to edit (not in any group, or is the group's base).
 *
 * Call this at the top of every Subject-Expert-facing content-mutation
 * endpoint, right after requireOwnedCourse, and return 409 with the
 * message if it's non-null.
 */
export async function blockedAsNonBaseCourse(courseId: string): Promise<string | null> {
  const membership = await prisma.courseContentSyncMember.findUnique({
    where: { courseId },
    include: { group: { include: { members: { where: { isBase: true }, include: { course: true } } } } },
  });
  if (!membership || membership.isBase) return null;
  const base = membership.group.members[0]?.course;
  return `This course inherits its content from ${base ? `${base.code} — ${base.title}` : "its linked base course"} and can't be edited directly. Edit the base course instead — this one will update automatically.`;
}

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
