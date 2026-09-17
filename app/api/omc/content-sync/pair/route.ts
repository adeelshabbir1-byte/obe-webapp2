import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { syncCourseContentToLinkedCourses } from "../../../../../lib/contentSync";
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

  if (memberA && !memberB) {
    groupId = memberA.groupId;
    await prisma.courseContentSyncMember.create({ data: { groupId, courseId: courseIdB } });
  } else if (memberB && !memberA) {
    groupId = memberB.groupId;
    await prisma.courseContentSyncMember.create({ data: { groupId, courseId: courseIdA } });
  } else if (memberA && memberB) {
    // Both already grouped, but in different groups — merge B's group into A's.
    groupId = memberA.groupId;
    await prisma.courseContentSyncMember.updateMany({ where: { groupId: memberB.groupId }, data: { groupId } });
    await prisma.courseContentSyncGroup.delete({ where: { id: memberB.groupId } }).catch(() => {});
  } else {
    const group = await prisma.courseContentSyncGroup.create({
      data: { chairmanId: user.managedById, createdById: user.id, name: `${courseA.code} / ${courseB.code}` },
    });
    groupId = group.id;
    await prisma.courseContentSyncMember.createMany({ data: [{ groupId, courseId: courseIdA }, { groupId, courseId: courseIdB }] });
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_PAIRED", entityType: "CourseContentSyncGroup", entityId: groupId, metadata: { courseIdA, courseIdB } });

  // The first sync event: sync FROM whichever of the two actually has
  // content, not blindly from A — otherwise pairing an empty course
  // against one with real work would wipe that work out immediately.
  // If both have content, A wins (same "replace, don't merge" rule as
  // everywhere else here) — disclosed in the UI before pairing, not
  // silently decided here. If neither has content yet, there's nothing
  // to propagate either direction.
  const [cloCountA, cloCountB] = await Promise.all([
    prisma.cLO.count({ where: { courseId: courseIdA } }),
    prisma.cLO.count({ where: { courseId: courseIdB } }),
  ]);
  const syncSourceId = cloCountA > 0 ? courseIdA : cloCountB > 0 ? courseIdB : null;
  const result = syncSourceId ? await syncCourseContentToLinkedCourses(syncSourceId) : { synced: [], skippedGraded: [] };

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

  return NextResponse.json({ groupId, alsoMadeEquivalent, ...result });
}
