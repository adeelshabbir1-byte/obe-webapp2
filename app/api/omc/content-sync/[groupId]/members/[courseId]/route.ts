import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { groupId: string; courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.courseContentSyncGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.chairmanId !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const removedMember = await prisma.courseContentSyncMember.findFirst({ where: { groupId: params.groupId, courseId: params.courseId } });
  await prisma.courseContentSyncMember.deleteMany({ where: { groupId: params.groupId, courseId: params.courseId } });

  // If the base itself was removed, the group would be left with no
  // base at all — promote whichever member joined earliest so there's
  // always exactly one, or clean up the group entirely if that was the
  // last member.
  if (removedMember?.isBase) {
    const remaining = await prisma.courseContentSyncMember.findMany({ where: { groupId: params.groupId }, orderBy: { id: "asc" } });
    if (remaining.length > 0) {
      await prisma.courseContentSyncMember.update({ where: { id: remaining[0].id }, data: { isBase: true } });
    } else {
      await prisma.courseContentSyncGroup.delete({ where: { id: params.groupId } }).catch(() => {});
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_MEMBER_REMOVED", entityType: "CourseContentSyncGroup", entityId: params.groupId, metadata: { courseId: params.courseId } });

  return NextResponse.json({ ok: true });
}
