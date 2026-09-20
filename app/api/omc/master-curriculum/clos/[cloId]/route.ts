import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { cloId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { statement, bloomLevel, orderIndex } = body;

  await prisma.masterCourseClo.update({
    where: { id: params.cloId },
    data: {
      ...(statement !== undefined && { statement: statement.trim() }),
      ...(bloomLevel !== undefined && { bloomLevel }),
      ...(orderIndex !== undefined && { orderIndex: Number(orderIndex) }),
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_CLO_UPDATED", entityType: "MasterCourseClo", entityId: params.cloId, metadata: { statement, bloomLevel, orderIndex } });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { cloId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.masterCourseClo.delete({ where: { id: params.cloId } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_CLO_DELETED", entityType: "MasterCourseClo", entityId: params.cloId });

  return NextResponse.json({ ok: true });
}
