import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

async function requireOwnedClo(cloId: string, chairmanId: string | null) {
  const clo = await prisma.masterCourseClo.findUnique({ where: { id: cloId }, include: { masterCourse: { include: { masterCurriculum: true } } } });
  if (!clo) return { error: "not found" as const, status: 404 };
  if (clo.masterCourse.masterCurriculum.chairmanId !== chairmanId) {
    return { error: "this belongs to the shared official reference copy (or another institution's own copy) — clone the curriculum first to make your own editable version", status: 403 as const };
  }
  return { clo };
}

export async function PUT(req: NextRequest, { params }: { params: { cloId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const owned = await requireOwnedClo(params.cloId, user.managedById);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

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

  const owned = await requireOwnedClo(params.cloId, user.managedById);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  await prisma.masterCourseClo.delete({ where: { id: params.cloId } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_CLO_DELETED", entityType: "MasterCourseClo", entityId: params.cloId });

  return NextResponse.json({ ok: true });
}
