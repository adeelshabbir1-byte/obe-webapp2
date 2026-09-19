import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { determineBaseCourseId } from "../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../lib/audit";

// One-time correction for groups formed before base re-evaluation
// existed: previously, only the very first two courses in a group ever
// had their base properly decided — everything that joined afterward
// became a follower unconditionally, even if it was actually more
// recent. This re-checks every existing group's base across ALL its
// current members at once and fixes any that are wrong.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const groups = await prisma.courseContentSyncGroup.findMany({
    where: { chairmanId: user.managedById },
    include: { members: true },
  });

  let groupsFixed = 0;
  const corrections: string[] = [];

  for (const group of groups) {
    if (group.members.length < 2) continue;
    const currentBase = group.members.find((m) => m.isBase);
    if (!currentBase) continue; // shouldn't happen, but nothing to compare against if it did

    let correctBaseCourseId = group.members[0].courseId;
    for (let i = 1; i < group.members.length; i++) {
      correctBaseCourseId = await determineBaseCourseId(correctBaseCourseId, group.members[i].courseId);
    }

    if (correctBaseCourseId === currentBase.courseId) continue; // already correct

    const [oldBaseCourse, newBaseCourse] = await Promise.all([
      prisma.course.findUnique({ where: { id: currentBase.courseId }, select: { code: true } }),
      prisma.course.findUnique({ where: { id: correctBaseCourseId }, select: { code: true } }),
    ]);

    // Old base cleared FIRST — otherwise both rows are briefly
    // isBase=true at once, which the one-base-per-group constraint
    // rejects immediately.
    await prisma.courseContentSyncMember.update({ where: { id: currentBase.id }, data: { isBase: false } });
    await prisma.courseContentSyncMember.updateMany({ where: { groupId: group.id, courseId: correctBaseCourseId }, data: { isBase: true } });
    await prisma.course.update({ where: { id: currentBase.courseId }, data: { subjectExpertId: null } });
    // The corrected base's content should now propagate out for real.
    await prisma.courseContentSyncGroup.update({ where: { id: group.id }, data: { needsSync: true } });

    groupsFixed++;
    corrections.push(`${group.name}: ${oldBaseCourse?.code || "?"} → ${newBaseCourse?.code || "?"}`);
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_BASES_CORRECTED", entityType: "CourseContentSyncGroup", entityId: "bulk", metadata: { groupsFixed } });

  return NextResponse.json({ groupsChecked: groups.length, groupsFixed, corrections });
}
