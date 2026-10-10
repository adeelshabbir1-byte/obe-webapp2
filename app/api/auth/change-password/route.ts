import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword, verifyPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  if (!body.newPassword || body.newPassword.length < 8) {
    return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
  }

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The first password is a shared default; choosing it (or your username) again defeats the point of changing it.
  const weak = ["12345678", "123456789", "password", "password1", "qwertyui"];
  if (weak.includes(String(body.newPassword).toLowerCase()) || String(body.newPassword).toLowerCase() === String(fullUser.username || "").toLowerCase()) {
    return NextResponse.json({ error: "that password is too easy to guess — choose something else" }, { status: 400 });
  }

  // If this isn't a forced first-login change, require the current password too.
  if (!fullUser.mustChangePassword) {
    if (!body.currentPassword || !(await verifyPassword(fullUser.passwordHash, body.currentPassword))) {
      return NextResponse.json({ error: "current password is incorrect" }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(body.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
  // Anyone else signed in with the old password is signed out; this browser stays signed in.
  const raw = cookies().get("session_token")?.value;
  const currentHash = raw ? crypto.createHash("sha256").update(raw).digest("hex") : "";
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null, tokenHash: { not: currentHash } }, data: { revokedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "PASSWORD_CHANGED" });

  return NextResponse.json({ ok: true });
}
