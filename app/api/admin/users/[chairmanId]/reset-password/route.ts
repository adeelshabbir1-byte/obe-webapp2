import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { hashPassword } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";

// The Super User sets a new password for an Institute Head (e.g. a forgotten one). Their open sessions are signed out.
export async function PUT(req: NextRequest, { params }: { params: { chairmanId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const head = await prisma.user.findUnique({ where: { id: params.chairmanId } });
  if (!head || head.role !== "CHAIRMAN") return NextResponse.json({ error: "Institute Head not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const pw = String(b.newPassword || "");
  if (pw.length < 8) return NextResponse.json({ error: "the new password needs at least 8 characters" }, { status: 400 });
  // A lost phone without backup codes: the Super User can also turn off the head's two-step sign-in.
  const turnOff = b.turnOffTwoStep === true;
  await prisma.user.update({ where: { id: head.id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: b.mustChange !== false, failedLoginCount: 0, lockedUntil: null, ...(turnOff ? { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null } : {}) } });
  await prisma.session.updateMany({ where: { userId: head.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "INSTITUTE_HEAD_PASSWORD_RESET", entityType: "User", entityId: head.id });
  if (turnOff) await writeAuditLog({ actorUserId: user.id, action: "MFA_TURNED_OFF_FOR_USER", entityType: "User", entityId: head.id });
  return NextResponse.json({ ok: true });
}
