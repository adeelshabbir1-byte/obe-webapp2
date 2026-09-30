import { prisma } from "./db";
import { copyCourseContent } from "./benchmarkCopy";
import { pairForEquivalence } from "./equivalencePairing";

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

  // The demoted former base is read-only now, so its own SE assignment
  // no longer applies there — but it should carry FORWARD onto the new
  // base rather than simply vanish. Before this, every single new batch
  // (which always becomes the new base — "most recent wins") started
  // with no Subject Expert at all even when the course it was copied
  // from had one, silently piling up as "still unassigned" batch after
  // batch. Only carried over when the SE actually reports to the new
  // course's own coordinator — a content-sync group can span more than
  // one coordinator's courses (e.g. the same course code in two
  // different degree programs), and an SE who doesn't report to this
  // course's coordinator could never have been assigned to it directly
  // anyway, so silently reassigning across that boundary would be new,
  // unreviewed exposure rather than a safe carry-over.
  const [oldBaseCourse, newBaseCourse] = await Promise.all([
    prisma.course.findUnique({ where: { id: currentBase.courseId }, select: { subjectExpertId: true } }),
    prisma.course.findUnique({ where: { id: newlyJoinedCourseId }, select: { coordinatorId: true } }),
  ]);
  await prisma.course.update({ where: { id: currentBase.courseId }, data: { subjectExpertId: null } });

  if (oldBaseCourse?.subjectExpertId && newBaseCourse) {
    const se = await prisma.user.findUnique({ where: { id: oldBaseCourse.subjectExpertId }, select: { managedById: true } });
    if (se?.managedById === newBaseCourse.coordinatorId) {
      await prisma.course.update({ where: { id: newlyJoinedCourseId }, data: { subjectExpertId: oldBaseCourse.subjectExpertId } });
    }
  }
}

/**
 * Pushes a base course's Subject Expert assignment onto every OTHER
 * member of its content-sync group that's from the same term or later —
 * the same scope rule syncCourseContentToLinkedCourses uses for content
 * itself. Call this right after assign-se updates a base course, so a
 * group's followers don't sit permanently unassigned just because the
 * page that assigns them only shows the base. Silently does nothing for
 * a course that isn't in a group, or for a follower whose own SE
 * doesn't report to that follower's coordinator (same cross-coordinator
 * guard as the base-promotion carry-over above).
 */
export async function syncSubjectExpertToLinkedCourses(sourceCourseId: string, subjectExpertId: string | null) {
  const membership = await prisma.courseContentSyncMember.findUnique({
    where: { courseId: sourceCourseId },
    include: { group: { include: { members: { include: { course: { include: { batch: true } } } } } } },
  });
  if (!membership) return;

  const sourceCourse = membership.group.members.find((m) => m.courseId === sourceCourseId)?.course;
  const sourceTermIndex = termIndex(sourceCourse?.batch?.startTerm, sourceCourse?.batch?.startYear);
  const others = membership.group.members.filter(
    (m) => m.courseId !== sourceCourseId && termIndex(m.course.batch?.startTerm, m.course.batch?.startYear) >= sourceTermIndex
  );
  if (others.length === 0) return;

  const se = subjectExpertId ? await prisma.user.findUnique({ where: { id: subjectExpertId }, select: { managedById: true } }) : null;

  for (const m of others) {
    const value = !subjectExpertId ? null : se?.managedById === m.course.coordinatorId ? subjectExpertId : undefined;
    if (value === undefined) continue; // SE doesn't report to this follower's coordinator — leave it as-is
    await prisma.course.update({ where: { id: m.courseId }, data: { subjectExpertId: value } });
  }
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
    // If the newly-added course happens to be offered in the same term
    // as any existing group member, they're genuinely the same real
    // class running twice — combine them for teaching too, same as
    // every other way a course can join a group. Uncommon on this
    // specific path (a newly-created batch is usually for a LATER term
    // than what's already in the group), but still possible when two
    // different programs' new batches both land in the same term.
    const newCourse = await prisma.course.findUnique({ where: { id: newCourseId } });
    if (newCourse?.offeredTermName) {
      const otherMembers = await prisma.courseContentSyncMember.findMany({
        where: { groupId: existingSourceMembership.groupId, courseId: { not: newCourseId } }, include: { course: true },
      });
      for (const m of otherMembers) {
        if (m.course.offeredTermName === newCourse.offeredTermName && m.course.offeredTermYear === newCourse.offeredTermYear) {
          await pairForEquivalence(newCourseId, m.course.id, chairmanId, chairmanId, true);
        }
      }
    }
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

  // Limited concurrency (4 at a time) rather than one at a time — the
  // connection pool was widened to connection_limit=5 earlier
  // specifically to allow this. Strictly sequential syncing was
  // originally chosen when the pool was capped at 1, but with a group
  // having 20+ members, doing every single one fully sequentially made
  // even one large group's sync alone take long enough to exceed a
  // request's time budget — this is what was actually causing "sync
  // all" to stall on the same group every retry.
  const CONCURRENCY = 4;
  for (let i = 0; i < otherCourseIds.length; i += CONCURRENCY) {
    const chunk = otherCourseIds.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (targetId) => {
      if (gradedCourseIds.has(targetId)) { skippedGraded.push(targetId); return; }

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
    }));
  }

  return { synced, skippedGraded, skippedOlderBatch };
}

/**
 * Propagates one course-level PLO-Course Matrix decision (OMC checking
 * or unchecking one PLO for one course) out to the rest of that course's
 * Content Sync group — the same "same course, other batches" grouping
 * CLOs/lecture plan/instruments already sync through. Only fires from
 * the group's BASE (a follower's own mapping was never authoritative to
 * begin with), and only reaches same-term-or-later members — an older,
 * already-taught batch is a historical record and is left untouched,
 * same rule as every other content-sync propagation.
 *
 * PLOs are batch-scoped (each batch has its own PLO rows), so the same
 * PLO in a different batch is matched by NUMBER, not by id — the same
 * convention "Copy PLO Mappings" and the HEC/System auto-map tools use.
 * A target batch that hasn't defined that PLO number yet is silently
 * skipped rather than erroring — OMC may not have finished setting up
 * that batch's own PLOs.
 */
export async function syncCoursePloMappingToLinkedCourses(sourceCourseId: string, ploNumber: number, mapped: boolean, assignedById: string) {
  const membership = await prisma.courseContentSyncMember.findUnique({
    where: { courseId: sourceCourseId },
    include: { group: { include: { members: { include: { course: { include: { batch: true } } } } } } },
  });
  if (!membership || !membership.isBase) return;

  const sourceCourse = membership.group.members.find((m) => m.courseId === sourceCourseId)?.course;
  const sourceTermIndex = termIndex(sourceCourse?.batch?.startTerm, sourceCourse?.batch?.startYear);
  const others = membership.group.members.filter(
    (m) => m.courseId !== sourceCourseId && termIndex(m.course.batch?.startTerm, m.course.batch?.startYear) >= sourceTermIndex
  );

  for (const m of others) {
    if (!m.course.batchId) continue;
    const targetPlo = await prisma.pLO.findUnique({ where: { batchId_number: { batchId: m.course.batchId, number: ploNumber } } });
    if (!targetPlo) continue;

    if (mapped) {
      await prisma.coursePloMapping.upsert({
        where: { courseId_ploId: { courseId: m.courseId, ploId: targetPlo.id } },
        create: { courseId: m.courseId, ploId: targetPlo.id, assignedById, source: "SYSTEM" },
        update: {},
      });
    } else {
      await prisma.coursePloMapping.deleteMany({ where: { courseId: m.courseId, ploId: targetPlo.id } });
    }
  }
}
