import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.courseContentSyncGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.chairmanId !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const { courseId } = body;
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const member = await prisma.courseContentSyncMember.findFirst({ where: { groupId: params.groupId, courseId } });
  if (!member) return NextResponse.json({ error: "that course isn't in this group" }, { status: 404 });
  if (member.isBase) return NextResponse.json({ ok: true }); // already the base

  // Any existing SE assignment on the course losing base status is
  // cleared — it's about to become read-only, so it shouldn't still
  // show an SE assigned to edit it.
  const previousBase = await prisma.courseContentSyncMember.findFirst({ where: { groupId: params.groupId, isBase: true } });

  await prisma.$transaction([
    prisma.courseContentSyncMember.updateMany({ where: { groupId: params.groupId }, data: { isBase: false } }),
    prisma.courseContentSyncMember.update({ where: { id: member.id }, data: { isBase: true } }),
    // Switching the base doesn't copy content immediately either — it
    // just flags the group as needing a sync, same as every other link
    // action. "Sync All Content" propagates the new base's content out
    // once it's actually run.
    prisma.courseContentSyncGroup.update({ where: { id: params.groupId }, data: { needsSync: true } }),
  ]);
  if (previousBase) {
    await prisma.course.update({ where: { id: previousBase.courseId }, data: { subjectExpertId: null } });
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_BASE_CHANGED", entityType: "CourseContentSyncGroup", entityId: params.groupId, metadata: { newBaseCourseId: courseId } });

  return NextResponse.json({ ok: true });
}
