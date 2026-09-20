import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { pendingId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const pending = await prisma.pendingMasterCourse.findUnique({ where: { id: params.pendingId } });
  if (!pending) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (pending.status !== "PENDING") return NextResponse.json({ error: "already reviewed" }, { status: 409 });

  await prisma.pendingMasterCourse.update({
    where: { id: pending.id }, data: { status: "REJECTED", reviewedByUserId: user.id, reviewedAt: new Date() },
  });
  await writeAuditLog({ actorUserId: user.id, action: "PENDING_MASTER_COURSE_REJECTED", entityType: "PendingMasterCourse", entityId: pending.id });

  return NextResponse.json({ ok: true });
}
