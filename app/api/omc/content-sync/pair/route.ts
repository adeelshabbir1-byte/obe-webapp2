import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { determineBaseCourseId, reconsiderGroupBase, syncSubjectExpertToLinkedCourses, syncGroupSubjectHome } from "../../../../../lib/contentSync";
import { pairForEquivalence } from "../../../../../lib/equivalencePairing";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const { courseIdA, courseIdB } = body;
  if (!courseIdA || !courseIdB || courseIdA === courseIdB) {
    return NextResponse.json({ error: "two different courseIds are required" }, { status: 400 });
  }

  const [courseA, courseB, memberA, memberB] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseIdA } }),
    prisma.course.findUnique({ where: { id: courseIdB } }),
    prisma.courseContentSyncMember.findUnique({ where: { courseId: courseIdA } }),
    prisma.courseContentSyncMember.findUnique({ where: { courseId: courseIdB } }),
  ]);
  if (!courseA || !courseB) return NextResponse.json({ error: "course not found" }, { status: 404 });

  if (memberA && memberB && memberA.groupId === memberB.groupId) {
    return NextResponse.json({ groupId: memberA.groupId });
  }

  let groupId: string;

  // Linking only ever creates/updates the group membership here — it
  // never copies content. That used to happen immediately on every
  // link, which was the actual reason "Accept All" could take hours:
  // every single course added meant a full content copy right then.
  // Content only moves once, explicitly, via "Sync All Content".
  if (memberA && !memberB) {
    // Joining an established group — but the newly-joining course might
    // actually be MORE recent than the group's current base, so the
    // base is re-checked below rather than assumed to stay put.
    groupId = memberA.groupId;
    await prisma.courseContentSyncMember.create({ data: { groupId, courseId: courseIdB, isBase: false } });
    await reconsiderGroupBase(groupId, courseIdB);
    await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });
  } else if (memberB && !memberA) {
    groupId = memberB.groupId;
    await prisma.courseContentSyncMember.create({ data: { groupId, courseId: courseIdA, isBase: false } });
    await reconsiderGroupBase(groupId, courseIdA);
    await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });
  } else if (memberA && memberB) {
    // Both already grouped, but in different groups — merge B's group
    // into A's. A's existing base stays the base UNLESS B's own base is
    // actually more recent, in which case the base switches — same
    // reconsideration as joining a single course, just checked against
    // whichever course was B's base specifically.
    groupId = memberA.groupId;
    const bGroupBase = await prisma.courseContentSyncMember.findFirst({ where: { groupId: memberB.groupId, isBase: true } });
    await prisma.courseContentSyncMember.updateMany({ where: { groupId: memberB.groupId }, data: { groupId, isBase: false } });
    await prisma.courseContentSyncGroup.delete({ where: { id: memberB.groupId } }).catch(() => {});
    if (bGroupBase) await reconsiderGroupBase(groupId, bGroupBase.courseId);
    await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });
  } else {
    // New group: the base is decided by the fixed seniority/degree-
    // program rule, not by which course happens to have content.
    const baseCourseId = await determineBaseCourseId(courseIdA, courseIdB);
    const loserCourse = baseCourseId === courseIdA ? courseB : courseA;
    const group = await prisma.courseContentSyncGroup.create({
      data: { chairmanId: user.managedById, createdById: user.id, name: `${courseA.code} / ${courseB.code}`, needsSync: true },
    });
    groupId = group.id;
    await prisma.courseContentSyncMember.createMany({
      data: [
        { groupId, courseId: courseIdA, isBase: baseCourseId === courseIdA },
        { groupId, courseId: courseIdB, isBase: baseCourseId === courseIdB },
      ],
    });
    // If the course that just lost base status already had its own SE
    // (from before it was ever linked), carry that assignment onto the
    // new base rather than just dropping it — same carry-over rule as
    // every other base-change path.
    if (loserCourse.subjectExpertId) {
      const baseCourse = await prisma.course.findUnique({ where: { id: baseCourseId }, select: { coordinatorId: true } });
      const se = await prisma.user.findUnique({ where: { id: loserCourse.subjectExpertId }, select: { managedById: true } });
      await prisma.course.update({ where: { id: loserCourse.id }, data: { subjectExpertId: null } });
      if (baseCourse && se?.managedById === baseCourse.coordinatorId) {
        await prisma.course.update({ where: { id: baseCourseId }, data: { subjectExpertId: loserCourse.subjectExpertId } });
      }
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_PAIRED", entityType: "CourseContentSyncGroup", entityId: groupId, metadata: { courseIdA, courseIdB } });

  await syncGroupSubjectHome(groupId);
  const groupBase = await prisma.courseContentSyncMember.findFirst({ where: { groupId, isBase: true }, include: { course: true } });

  // Every base-change branch above (reconsiderGroupBase, or the new-
  // group carry-over just above) already clears the SE off whichever
  // course actually just lost base status and carries it onto the new
  // base — there used to be a blanket "clear SE on every non-base course
  // in the group" step here too, which was wiping out that carry-over
  // (and every other follower's inherited assignment) on every single
  // link/merge action. Removed; push the base's SE out to the rest of
  // the group instead, so followers actually end up assigned like the
  // Assign Subject Experts page promises.
  if (groupBase?.course.subjectExpertId) {
    await syncSubjectExpertToLinkedCourses(groupBase.courseId, groupBase.course.subjectExpertId);
  }

  // If these two are also actually offered in the same term, they're
  // genuinely the same real class running twice — combine them for
  // teaching too, by default, per your instruction. Different terms
  // just means "share content", nothing more.
  let alsoMadeEquivalent = false;
  if (courseA.offeredTermName && courseA.offeredTermName === courseB.offeredTermName && courseA.offeredTermYear === courseB.offeredTermYear) {
    const eqResult = await pairForEquivalence(courseIdA, courseIdB, user.managedById, user.id, true);
    if (eqResult) {
      alsoMadeEquivalent = true;
      await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_PAIRED", entityType: "CourseEquivalenceGroup", entityId: eqResult.groupId, metadata: { courseIdA, courseIdB, viaContentSync: true } });
    }
  }

  return NextResponse.json({ groupId, alsoMadeEquivalent, baseCourseCode: groupBase?.course.code || null });
}
