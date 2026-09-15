import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { hashPassword } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const faculty = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!faculty || faculty.managedById !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.newPassword || body.newPassword.length < 6) {
    return NextResponse.json({ error: "new password must be at least 6 characters" }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.newPassword);
  await prisma.user.update({
    where: { id: params.userId },
    data: { passwordHash, mustChangePassword: true },
  });

  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_PASSWORD_RESET", entityType: "User", entityId: params.userId });

  return NextResponse.json({ ok: true });
}
