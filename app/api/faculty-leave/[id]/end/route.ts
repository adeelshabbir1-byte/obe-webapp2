import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { ldb, LEAVE_MANAGERS, type LeaveRow } from "../../../../../lib/facultyLeave";
import { chairmanIdFor } from "../../../../../lib/reportScope";

// POST — the teacher is back (or rejoined): the leave ends now and courses can be given to them again.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !LEAVE_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const l = (await ldb.facultyLeave.findUnique({ where: { id: params.id } })) as LeaveRow | null;
  if (!l || l.chairmanId !== (await chairmanIdFor(user))) return NextResponse.json({ error: "not found" }, { status: 404 });
  await ldb.facultyLeave.update({ where: { id: l.id }, data: { endedAt: new Date() } });
  if (l.kind === "LEFT") await prisma.user.update({ where: { id: l.userId }, data: { isActive: true } });
  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_LEAVE_ENDED", entityType: "User", entityId: l.userId, metadata: { kind: l.kind } });
  return NextResponse.json({ ok: true });
}
