import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword, verifyPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  if (!body.newPassword || body.newPassword.length < 8) {
    return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
  }

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser) return NextResponse.json({ error: "not found" }, { status: 404 });

  // If this isn't a forced first-login change, require the current password too.
  if (!fullUser.mustChangePassword) {
    if (!body.currentPassword || !(await verifyPassword(fullUser.passwordHash, body.currentPassword))) {
      return NextResponse.json({ error: "current password is incorrect" }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(body.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
  await writeAuditLog({ actorUserId: user.id, action: "PASSWORD_CHANGED" });

  return NextResponse.json({ ok: true });
}
