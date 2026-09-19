import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { determineBaseCourseId } from "../../../../../lib/contentSync";
import { pairForEquivalence } from "../../../../../lib/equivalencePairing";

// Links any number of courses (2+) into one group in a single request —
// select several, then submit once, instead of one /pair call per
// course. Existing group memberships among the selected courses are
// respected and merged the same way /pair does for two at a time.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const courseIds: string[] = Array.from(new Set(body.courseIds || []));
  if (courseIds.length < 2) return NextResponse.json({ error: "select at least two courses" }, { status: 400 });

  const courses = await prisma.course.findMany({ where: { id: { in: courseIds } }, include: { batch: true } });
  if (courses.length !== courseIds.length) return NextResponse.json({ error: "one or more courses not found" }, { status: 404 });

  const memberships = await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: courseIds } } });
  const membershipByCourseId = new Map(memberships.map((m) => [m.courseId, m]));
  const existingGroupIds = Array.from(new Set(memberships.map((m) => m.groupId)));

  let groupId: string;
  let baseCourseId: string;

  if (existingGroupIds.length > 0) {
    // At least one selected course already belongs to a group — reuse
    // the first such group (and its existing base) rather than starting
    // a new one; merge every other existing group among the selection
    // into it, same as /pair's merge behavior for two groups at a time.
    groupId = existingGroupIds[0];
    const existingBase = memberships.find((m) => m.groupId === groupId && m.isBase);
    baseCourseId = existingBase?.courseId || memberships.find((m) => m.groupId === groupId)!.courseId;

    for (const otherGroupId of existingGroupIds.slice(1)) {
      await prisma.courseContentSyncMember.updateMany({ where: { groupId: otherGroupId }, data: { groupId, isBase: false } });
      await prisma.courseContentSyncGroup.delete({ where: { id: otherGroupId } }).catch(() => {});
    }
  } else {
    // Nobody selected is grouped yet — decide the base by the fixed
    // seniority/degree-program rule across ALL selected courses, not
    // just a pairwise comparison: repeatedly keep whichever of two
    // candidates the rule prefers.
    baseCourseId = courseIds[0];
    for (let i = 1; i < courseIds.length; i++) {
      baseCourseId = await determineBaseCourseId(baseCourseId, courseIds[i]);
    }
    const group = await prisma.courseContentSyncGroup.create({
      data: { chairmanId: user.managedById, createdById: user.id, name: `${courses[0].code} group (${courseIds.length} courses)`, needsSync: true },
    });
    groupId = group.id;
  }

  // Add every selected course that isn't already in this exact group.
  const toAdd = courseIds.filter((id) => {
    const m = membershipByCourseId.get(id);
    return !m || m.groupId !== groupId;
  });
  if (toAdd.length > 0) {
    await prisma.courseContentSyncMember.createMany({
      data: toAdd.map((courseId) => ({ groupId, courseId, isBase: courseId === baseCourseId })),
      skipDuplicates: true,
    });
  }
  // Make sure exactly the intended course ends up marked base, even if
  // it was newly added in the step above or already existed as a
  // follower.
  await prisma.courseContentSyncMember.updateMany({ where: { groupId, courseId: { not: baseCourseId } }, data: { isBase: false } });
  await prisma.courseContentSyncMember.updateMany({ where: { groupId, courseId: baseCourseId }, data: { isBase: true } });

  // Linking only ever updates group membership and flags it as needing
  // a sync — it never copies content immediately. That used to happen
  // right here, which was the actual reason "Accept All" could take
  // hours: every course added meant a full content copy on the spot.
  // Content only moves once, explicitly, via "Sync All Content".
  await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_GROUPED_MULTIPLE", entityType: "CourseContentSyncGroup", entityId: groupId, metadata: { courseIds: courseIds.join(","), baseCourseId } });

  await prisma.course.updateMany({ where: { contentSyncMember: { groupId, isBase: false } }, data: { subjectExpertId: null } });

  // Same as /pair: any two of the selected courses that are actually
  // offered in the same term are genuinely one real class running
  // twice, so they're also combined for teaching, not just content.
  let equivalencePairsMade = 0;
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      if (courses[i].offeredTermName && courses[i].offeredTermName === courses[j].offeredTermName && courses[i].offeredTermYear === courses[j].offeredTermYear) {
        const eqResult = await pairForEquivalence(courses[i].id, courses[j].id, user.managedById, user.id, true);
        if (eqResult) equivalencePairsMade++;
      }
    }
  }

  const baseCourse = courses.find((c) => c.id === baseCourseId);
  return NextResponse.json({ groupId, baseCourseCode: baseCourse?.code || null, equivalencePairsMade });
}
