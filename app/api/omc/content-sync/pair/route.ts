import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { determineBaseCourseId } from "../../../../../lib/contentSync";
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
    // Joining an established group — it already has a base (fixed by
    // seniority when the group was first formed), so the new course
    // simply joins as a follower, whatever its own seniority is.
    groupId = memberA.groupId;
    await prisma.courseContentSyncMember.create({ data: { groupId, courseId: courseIdB, isBase: false } });
    await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });
  } else if (memberB && !memberA) {
    groupId = memberB.groupId;
    await prisma.courseContentSyncMember.create({ data: { groupId, courseId: courseIdA, isBase: false } });
    await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });
  } else if (memberA && memberB) {
    // Both already grouped, but in different groups — merge B's group
    // into A's. A's existing base stays the base; B's base (if it had
    // one) is demoted to a follower, since a merged group can only have
    // one.
    groupId = memberA.groupId;
    await prisma.courseContentSyncMember.updateMany({ where: { groupId: memberB.groupId }, data: { groupId, isBase: false } });
    await prisma.courseContentSyncGroup.delete({ where: { id: memberB.groupId } }).catch(() => {});
    await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });
  } else {
    // New group: the base is decided by the fixed seniority/degree-
    // program rule, not by which course happens to have content.
    const baseCourseId = await determineBaseCourseId(courseIdA, courseIdB);
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
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_PAIRED", entityType: "CourseContentSyncGroup", entityId: groupId, metadata: { courseIdA, courseIdB } });

  const groupBase = await prisma.courseContentSyncMember.findFirst({ where: { groupId, isBase: true }, include: { course: true } });

  // Any SE previously assigned to a course that's now non-base is
  // cleared — it's read-only going forward, so it shouldn't still show
  // someone assigned to edit it. This is a plain field update, not a
  // content copy, so it still happens immediately.
  if (groupBase) {
    await prisma.course.updateMany({
      where: { contentSyncMember: { groupId, isBase: false } },
      data: { subjectExpertId: null },
    });
  }

  // If these two are also actually offered in the same term, they're
  // genuinely the same real class running twice — combine them for
  // teaching too, by default, per your instruction. Different terms
  // just means "share content", nothing more.
  let alsoMadeEquivalent = false;
  if (courseA.offeredTermName && courseA.offeredTermName === courseB.offeredTermName && courseA.offeredTermYear === courseB.offeredTermYear) {
    const eqResult = await pairForEquivalence(courseIdA, courseIdB, user.managedById, user.id);
    if (eqResult) {
      alsoMadeEquivalent = true;
      await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_PAIRED", entityType: "CourseEquivalenceGroup", entityId: eqResult.groupId, metadata: { courseIdA, courseIdB, viaContentSync: true } });
    }
  }

  return NextResponse.json({ groupId, alsoMadeEquivalent, baseCourseCode: groupBase?.course.code || null });
}
