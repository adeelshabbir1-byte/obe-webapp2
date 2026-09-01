import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const studentCount = parseInt(body.studentCount, 10);
  if (isNaN(studentCount) || studentCount < 0) return NextResponse.json({ error: "studentCount must be a non-negative number" }, { status: 400 });

  const updated = await prisma.batch.update({ where: { id: batch.id }, data: { studentCount } });

  await writeAuditLog({ actorUserId: user.id, action: "BATCH_STUDENT_COUNT_UPDATED", entityType: "Batch", entityId: batch.id, metadata: { studentCount } });

  return NextResponse.json({ batch: updated });
}
