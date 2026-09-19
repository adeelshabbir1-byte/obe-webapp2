import { prisma } from "./db";
import { copyCourseContent } from "./benchmarkCopy";

const DEGREE_PRIORITY = ["computer science", "software engineering", "artificial intelligence", "cyber", "data science"];
function degreePriorityRank(degreeProgram: string | null | undefined): number {
  const lower = (degreeProgram || "").toLowerCase();
  const i = DEGREE_PRIORITY.findIndex((d) => lower.includes(d));
  return i === -1 ? DEGREE_PRIORITY.length : i;
}
function termIndex(term: string | null | undefined, year: number | null | undefined): number {
  if (!term || !year) return -Infinity; // unset term/year sorts first — never treated as "most recent"
  return term === "Spring" ? year * 2 - 1 : year * 2;
}

/**
 * Decides which of two courses should be the content-sync BASE — the
 * one Subject Experts actually edit. Per the chairman's fixed rule: the
 * course from the MOST RECENTLY started batch wins (not the oldest —
 * editing a years-old, already-taught batch to reflect a new curriculum
 * decision would make it look like that batch's instructor didn't
 * follow guidance they actually did follow correctly at the time). If
 * both batches started in the same term, falls back to degree-program
 * priority (Computer Science > Software Engineering > Artificial
 * Intelligence > Cyber Security > Data Science). Deterministic — not
 * based on which one happens to have content already.
 */
export async function determineBaseCourseId(courseIdA: string, courseIdB: string): Promise<string> {
  const [courseA, courseB] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseIdA }, include: { batch: true } }),
    prisma.course.findUnique({ where: { id: courseIdB }, include: { batch: true } }),
  ]);
  const termA = termIndex(courseA?.batch?.startTerm, courseA?.batch?.startYear);
  const termB = termIndex(courseB?.batch?.startTerm, courseB?.batch?.startYear);
  if (termA !== termB) return termA > termB ? courseIdA : courseIdB; // later start = more recent = wins

  const rankA = degreePriorityRank(courseA?.batch?.degreeProgram);
  const rankB = degreePriorityRank(courseB?.batch?.degreeProgram);
  return rankA <= rankB ? courseIdA : courseIdB;
}

/**
 * Call this after adding a course to an ALREADY-EXISTING group (joining,
 * not creating a new one) — re-checks whether the newly-joined course
 * should actually replace the current base, per the same seniority/
 * degree-program rule used when a group is first formed.
 *
 * This matters because a group's base was previously only ever decided
 * once, when the group was first created between two courses — every
 * later course that joined that same group just became a follower
 * unconditionally, even if it was actually more senior than the
 * existing base. Since real links get built up incrementally over time
 * (not all at once), that left plenty of groups with a base that wasn't
 * actually the most senior course in them, contradicting the rule the
 * chairman explicitly set.
 */
export async function reconsiderGroupBase(groupId: string, newlyJoinedCourseId: string) {
  const currentBase = await prisma.courseContentSyncMember.findFirst({ where: { groupId, isBase: true } });
  if (!currentBase || currentBase.courseId === newlyJoinedCourseId) return;

  const shouldBeBase = await determineBaseCourseId(currentBase.courseId, newlyJoinedCourseId);
  if (shouldBeBase === currentBase.courseId) return; // current base is still correct

  // The old base's row is cleared FIRST — otherwise both rows are
  // briefly isBase=true at once, which the one-base-per-group unique
  // constraint rejects immediately (not deferred to commit).
  await prisma.courseContentSyncMember.update({ where: { id: currentBase.id }, data: { isBase: false } });
  await prisma.courseContentSyncMember.updateMany({ where: { groupId, courseId: newlyJoinedCourseId }, data: { isBase: true } });
  // The demoted former base may have had an SE assigned while it was
  // still the base — it's read-only now, so that assignment is cleared,
  // same as everywhere else a course loses base status.
  await prisma.course.update({ where: { id: currentBase.courseId }, data: { subjectExpertId: null } });
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
 * Links a newly-copied course as a follower of the course it was copied
 * from — used when a program/batch is itself a copy of another (auto-
 * copy-from-previous-batch, or the manual "copy from another batch"
 * flow), so the two stay in sync going forward rather than just sharing
 * a one-time snapshot. If the source course is already part of a
 * content-sync group (e.g. it was itself copied from an even earlier
 * batch), the new course joins that same group as a follower instead of
 * starting a separate one — so a whole lineage of batches stays linked
 * to a single base, not a chain of pairs.
 *
 * Silently does nothing if the two courses are already linked (e.g. this
 * ran twice) or if sourceCourseId doesn't exist — best-effort, since one
 * failed link shouldn't stop the rest of a batch copy.
 */
export async function linkAsFollowerOfSource(sourceCourseId: string, newCourseId: string, chairmanId: string) {
  const [existingSourceMembership, existingNewMembership] = await Promise.all([
    prisma.courseContentSyncMember.findUnique({ where: { courseId: sourceCourseId } }),
    prisma.courseContentSyncMember.findUnique({ where: { courseId: newCourseId } }),
  ]);
  if (existingNewMembership) return; // already linked to something — don't disturb it

  // A newly-created batch's course is, by definition, more recent than
  // anything that already existed when this runs — so under the
  // "most recent wins" rule it should always become the group's new
  // base, not join as a follower. It's added as isBase:false first
  // (satisfying the "exactly one base" constraint immediately) and then
  // promoted properly via reconsiderGroupBase, which also handles
  // clearing the old base correctly.
  if (existingSourceMembership) {
    await prisma.courseContentSyncMember.create({ data: { groupId: existingSourceMembership.groupId, courseId: newCourseId, isBase: false } });
    await reconsiderGroupBase(existingSourceMembership.groupId, newCourseId);
    return;
  }

  const sourceCourse = await prisma.course.findUnique({ where: { id: sourceCourseId } });
  if (!sourceCourse) return;

  const group = await prisma.courseContentSyncGroup.create({
    data: { chairmanId, createdById: null, name: `${sourceCourse.code} (batch copy lineage)` },
  });
  // The new course is the base — it's the one just created, so it's
  // always the most recent of the two.
  await prisma.courseContentSyncMember.createMany({
    data: [{ groupId: group.id, courseId: sourceCourseId, isBase: false }, { groupId: group.id, courseId: newCourseId, isBase: true }],
  });
}

/**
 * Call this at the end of any Subject Expert action that changes a
 * course's content (CLOs, PLO mappings, weekly lecture plan, assessment
 * instruments, textbook/description fields, or assessment weight %s).
 *
 * If the course is a member of a CourseContentSyncGroup, its content is
 * copied onto every OTHER member from the SAME term or later — never to
 * an older, already-completed batch. Editing an already-taught batch's
 * course to reflect a newer curriculum decision would misrepresent that
 * batch's instructor as having not followed guidance they actually
 * followed correctly at the time; older batches stay locked historical
 * record regardless of what the current base later becomes.
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
    include: { group: { include: { members: { include: { course: { include: { batch: true } } } } } } },
  });
  if (!membership) return { synced: [], skippedGraded: [], skippedOlderBatch: [] };

  const sourceCourse = membership.group.members.find((m) => m.courseId === sourceCourseId)?.course;
  const sourceTermIndex = termIndex(sourceCourse?.batch?.startTerm, sourceCourse?.batch?.startYear);

  // Only same-term-or-later members are real sync targets — an older
  // one is a completed batch's historical record and is left untouched
  // no matter what.
  const allOthers = membership.group.members.filter((m) => m.courseId !== sourceCourseId);
  const skippedOlderBatch = allOthers
    .filter((m) => termIndex(m.course.batch?.startTerm, m.course.batch?.startYear) < sourceTermIndex)
    .map((m) => m.courseId);
  const otherCourseIds = allOthers
    .filter((m) => termIndex(m.course.batch?.startTerm, m.course.batch?.startYear) >= sourceTermIndex)
    .map((m) => m.courseId);
  if (otherCourseIds.length === 0) return { synced: [], skippedGraded: [], skippedOlderBatch };

  const gradedCounts = await prisma.studentMark.groupBy({
    by: ["courseId"], where: { courseId: { in: otherCourseIds } }, _count: { id: true },
  });
  const gradedCourseIds = new Set(gradedCounts.map((g) => g.courseId));

  const synced: string[] = [];
  const skippedGraded: string[] = [];

  // Sequential across targets, not parallel — this project's DB
  // connection is constrained to a small pool (connection_limit=1, set
  // earlier to fix a different exhaustion issue), so running several
  // targets' queries concurrently risks contention/timeouts rather than
  // actually saving time; a failure partway through previously meant
  // every course after it in a larger group was silently never synced.
  for (const targetId of otherCourseIds) {
    if (gradedCourseIds.has(targetId)) { skippedGraded.push(targetId); continue; }

    await prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: targetId } } });
    // PaperDistributionItem references both LectureRow and CLO via FK,
    // so it must clear first. Then LectureRow itself references CLO
    // (via cloId), so it has to go before CLO too — only once both of
    // those are gone can CLO, AssessmentInstrument, and
    // CoursePloMapping (none of which anything else still points at)
    // safely run together.
    await prisma.paperDistributionItem.deleteMany({ where: { courseId: targetId } });
    await prisma.lectureRow.deleteMany({ where: { courseId: targetId } });
    await prisma.assessmentInstrument.deleteMany({ where: { courseId: targetId } });
    await prisma.cLO.deleteMany({ where: { courseId: targetId } });
    await prisma.coursePloMapping.deleteMany({ where: { courseId: targetId } });

    await copyCourseContent(sourceCourseId, targetId);
    synced.push(targetId);
  }

  return { synced, skippedGraded, skippedOlderBatch };
}
