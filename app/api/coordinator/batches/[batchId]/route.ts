import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { deleteBatchCompletely } from "../../../../../lib/deleteBatchCompletely";
import { writeAuditLog } from "../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await deleteBatchCompletely(params.batchId);
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_DELETED", entityType: "Batch", entityId: params.batchId });

  return NextResponse.json({ ok: true });
}
