import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.courseEquivalenceGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.chairmanId !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.groupSectionAssignment.deleteMany({ where: { groupId: params.groupId } });
  await prisma.courseEquivalenceMember.deleteMany({ where: { groupId: params.groupId } });
  await prisma.courseEquivalenceGroup.delete({ where: { id: params.groupId } });

  await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_GROUP_DELETED", entityType: "CourseEquivalenceGroup", entityId: params.groupId });

  return NextResponse.json({ ok: true });
}
