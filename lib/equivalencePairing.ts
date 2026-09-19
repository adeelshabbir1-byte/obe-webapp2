import { prisma } from "./db";
import { copyCourseContent } from "./benchmarkCopy";

/** Marks two courses as one combined class for teaching purposes (Course
 * Equivalence) — merges/creates the CourseEquivalenceGroup they belong
 * to, and (unless skipContentCopy is set) gives an empty course a head
 * start from the other's content if one side has none yet. Only makes
 * sense when both are actually offered in the same term; callers should
 * check that before calling this.
 *
 * skipContentCopy is set by Content Sync's own pairing/grouping, since
 * that feature already owns content-copying via its own explicit "Sync
 * All Content" step — running this function's copy too, on every
 * same-term pair among potentially many selected courses, was a real
 * source of "linking still takes a while" even after content sync's own
 * copy step was made explicit and deferred. */
export async function pairForEquivalence(courseIdA: string, courseIdB: string, chairmanId: string, actorUserId: string, skipContentCopy = false) {
  const [courseA, courseB, memberA, memberB] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseIdA } }),
    prisma.course.findUnique({ where: { id: courseIdB } }),
    prisma.courseEquivalenceMember.findUnique({ where: { courseId: courseIdA } }),
    prisma.courseEquivalenceMember.findUnique({ where: { courseId: courseIdB } }),
  ]);
  if (!courseA || !courseB) return null;

  if (memberA && memberB && memberA.groupId === memberB.groupId) return { groupId: memberA.groupId };

  let groupId: string;
  if (memberA && !memberB) {
    groupId = memberA.groupId;
    await prisma.courseEquivalenceMember.create({ data: { groupId, courseId: courseIdB } });
  } else if (memberB && !memberA) {
    groupId = memberB.groupId;
    await prisma.courseEquivalenceMember.create({ data: { groupId, courseId: courseIdA } });
  } else if (memberA && memberB) {
    groupId = memberA.groupId;
    await prisma.courseEquivalenceMember.updateMany({ where: { groupId: memberB.groupId }, data: { groupId } });
    await prisma.courseEquivalenceGroup.delete({ where: { id: memberB.groupId } }).catch(() => {});
  } else {
    const group = await prisma.courseEquivalenceGroup.create({
      data: { chairmanId, createdById: actorUserId, name: `${courseA.code} / ${courseB.code}` },
    });
    groupId = group.id;
    await prisma.courseEquivalenceMember.createMany({ data: [{ groupId, courseId: courseIdA }, { groupId, courseId: courseIdB }] });
  }

  if (!skipContentCopy) {
    await copyFullContentIfEmpty(courseIdA, courseIdB);
    await copyFullContentIfEmpty(courseIdB, courseIdA);
    await copyPloMappingByNumber(courseIdA, courseIdB);
    await copyPloMappingByNumber(courseIdB, courseIdA);
  }

  return { groupId };
}

async function copyFullContentIfEmpty(fromCourseId: string, toCourseId: string) {
  const [fromCloCount, toCloCount] = await Promise.all([
    prisma.cLO.count({ where: { courseId: fromCourseId, source: "SE" } }),
    prisma.cLO.count({ where: { courseId: toCourseId, source: "SE" } }),
  ]);
  if (fromCloCount === 0 || toCloCount > 0) return;
  await copyCourseContent(fromCourseId, toCourseId);
}

async function copyPloMappingByNumber(fromCourseId: string, toCourseId: string) {
  const [fromMappings, toMappings, toCourse] = await Promise.all([
    prisma.coursePloMapping.findMany({ where: { courseId: fromCourseId }, include: { plo: true } }),
    prisma.coursePloMapping.count({ where: { courseId: toCourseId } }),
    prisma.course.findUnique({ where: { id: toCourseId } }),
  ]);
  if (fromMappings.length === 0 || toMappings > 0 || !toCourse) return;

  const toPlos = await prisma.pLO.findMany({ where: { batchId: toCourse.batchId || "", number: { in: fromMappings.map((m) => m.plo.number) } } });
  const toPloByNumber = new Map(toPlos.map((p) => [p.number, p]));

  for (const m of fromMappings) {
    const match = toPloByNumber.get(m.plo.number);
    if (match) {
      await prisma.coursePloMapping.upsert({
        where: { courseId_ploId: { courseId: toCourseId, ploId: match.id } },
        create: { courseId: toCourseId, ploId: match.id, assignedById: m.assignedById },
        update: {},
      });
    }
  }
}
