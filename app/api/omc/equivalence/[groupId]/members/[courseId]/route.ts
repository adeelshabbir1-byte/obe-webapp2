import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { groupId: string; courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.courseEquivalenceGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.chairmanId !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.courseEquivalenceMember.deleteMany({ where: { groupId: params.groupId, courseId: params.courseId } });

  await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_MEMBER_REMOVED", entityType: "CourseEquivalenceGroup", entityId: params.groupId, metadata: { courseId: params.courseId } });

  return NextResponse.json({ ok: true });
}
