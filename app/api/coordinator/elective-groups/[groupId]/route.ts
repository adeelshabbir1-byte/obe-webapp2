import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.electiveSlotGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (group.finalized) return NextResponse.json({ error: "already finalized — can't be deleted" }, { status: 400 });

  await prisma.electiveChoice.deleteMany({ where: { groupId: group.id } });
  await prisma.electiveSlotOption.deleteMany({ where: { groupId: group.id } });
  await prisma.electiveSlotGroup.delete({ where: { id: group.id } });

  await writeAuditLog({ actorUserId: user.id, action: "ELECTIVE_GROUP_DELETED", entityType: "Batch", entityId: group.batchId, metadata: { groupId: group.id, label: group.label } });

  return NextResponse.json({ ok: true });
}
