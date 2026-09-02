import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.sourceBatchId || !body.targetBatchId) {
    return NextResponse.json({ error: "sourceBatchId and targetBatchId are required" }, { status: 400 });
  }
  if (body.sourceBatchId === body.targetBatchId) {
    return NextResponse.json({ error: "source and target batch must be different" }, { status: 400 });
  }

  const [sourceBatch, targetBatch] = await Promise.all([
    prisma.batch.findUnique({ where: { id: body.sourceBatchId } }),
    prisma.batch.findUnique({ where: { id: body.targetBatchId } }),
  ]);
  if (!sourceBatch || sourceBatch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid source batch" }, { status: 400 });
  if (!targetBatch || targetBatch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid target batch" }, { status: 400 });

  const [sourcePlos, existingNumbers] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId: sourceBatch.id } }),
    prisma.pLO.findMany({ where: { batchId: targetBatch.id }, select: { number: true } }),
  ]);
  const existingSet = new Set(existingNumbers.map((p) => p.number));

  const toCreate = sourcePlos.filter((p) => !existingSet.has(p.number));
  if (toCreate.length > 0) {
    await prisma.pLO.createMany({
      data: toCreate.map((p) => ({
        coordinatorId: user.id, batchId: targetBatch.id, number: p.number, title: p.title, description: p.description,
        sourceMasterPloNumber: p.sourceMasterPloNumber,
      })),
    });
  }

  await writeAuditLog({
    actorUserId: user.id, action: "PLOS_COPIED_FROM_BATCH", entityType: "Batch", entityId: targetBatch.id,
    metadata: { sourceBatchId: sourceBatch.id, created: toCreate.length },
  });

  return NextResponse.json({ created: toCreate.length, skipped: sourcePlos.length - toCreate.length });
}
