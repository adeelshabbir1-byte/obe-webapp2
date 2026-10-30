import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { hashPassword } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { institutePeople } from "../../../../../lib/institutePeople";
import { passwordProblem } from "../../../../../lib/passwordPolicy";
import { withErrors } from "../../../../../lib/apiHandler";

// The Institute Head resets the password of anyone in the institute, and/or turns off their two-step sign-in
// (a lost phone without backup codes). body: { userId, newPassword?, turnOffTwoStep? }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head can do this." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const userId = String(b.userId || "");
  if (!userId || userId === user.id) return NextResponse.json({ error: "Change your own password under Change Password." }, { status: 400 });
  const person = (await institutePeople(user.id)).find((p) => p.id === userId);
  if (!person) return NextResponse.json({ error: "That person is not in your institute." }, { status: 404 });
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, role: true } });
  if (!target || target.role === "CHAIRMAN" || target.role === "SUPER_USER") return NextResponse.json({ error: "not found" }, { status: 404 });

  const resetPassword = typeof b.newPassword === "string" && b.newPassword.length > 0;
  const turnOff = b.turnOffTwoStep === true;
  if (!resetPassword && !turnOff) return NextResponse.json({ error: "Type a temporary password, or tick “Turn off two-step sign-in”." }, { status: 400 });
  if (resetPassword) {
    const problem = passwordProblem(b.newPassword, target.username);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(resetPassword ? { passwordHash: await hashPassword(b.newPassword), mustChangePassword: true } : {}),
      ...(turnOff ? { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null } : {}),
      failedLoginCount: 0, lockedUntil: null,
    },
  });
  // Whoever was signed in as them (perhaps with the lost phone) is signed out.
  await prisma.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (resetPassword) await writeAuditLog({ actorUserId: user.id, action: "STAFF_PASSWORD_RESET", entityType: "User", entityId: target.id });
  if (turnOff) await writeAuditLog({ actorUserId: user.id, action: "MFA_TURNED_OFF_FOR_USER", entityType: "User", entityId: target.id });
  const done = [resetPassword && "Temporary password set — they choose their own at the next sign-in", turnOff && "two-step sign-in turned off"].filter(Boolean).join("; ");
  return NextResponse.json({ ok: true, result: `${done}. ${person.name} has been signed out everywhere.` });
}
export const POST = withErrors(POST_handler);
