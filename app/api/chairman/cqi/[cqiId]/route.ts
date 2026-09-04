import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { cqiId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["CHAIRMAN", "OMC"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const record = await prisma.cqiRecord.findUnique({ where: { id: params.cqiId } });
  const chairmanId = await chairmanIdFor(user);
  if (!record || record.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.cqiRecord.update({
    where: { id: params.cqiId },
    data: {
      actionTaken: body.actionTaken !== undefined ? body.actionTaken : record.actionTaken,
      status: body.status || record.status,
      lastUpdatedById: user.id,
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "CQI_RECORD_UPDATED", entityType: "CqiRecord", entityId: params.cqiId });
  return NextResponse.json({ record: updated });
}
