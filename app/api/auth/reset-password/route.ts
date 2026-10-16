import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";
import { passwordProblem } from "../../../../lib/passwordPolicy";

const hashOf = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

async function liveToken(raw: unknown) {
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 200) return null;
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashOf(raw) }, include: { user: { select: { id: true, username: true, isActive: true } } } }).catch(() => null);
  if (!t || t.usedAt || t.revokedAt || t.expiresAt < new Date() || !t.user.isActive) return null;
  return t;
}

// GET ?token= — whether a reset link can still be used (the page shows the form or an "expired" message).
export async function GET(req: NextRequest) {
  return NextResponse.json({ valid: !!(await liveToken(req.nextUrl.searchParams.get("token"))) });
}

// POST { token, newPassword } — set the new password. The link is used up, every session is signed out and a
// lock from wrong passwords is lifted. Two-step sign-in still applies at the next sign-in.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const t = await liveToken(b.token);
  if (!t) return NextResponse.json({ error: "This link has expired or was already used. Ask for a new one." }, { status: 400 });
  const problem = passwordProblem(b.newPassword, t.user.username);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const now = new Date();
  // Claim the link first, so two requests with the same link can't both succeed.
  const claimed = await prisma.passwordResetToken.updateMany({ where: { id: t.id, usedAt: null, revokedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return NextResponse.json({ error: "This link has expired or was already used. Ask for a new one." }, { status: 400 });
  await prisma.user.update({ where: { id: t.user.id }, data: { passwordHash: await hashPassword(b.newPassword), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } });
  await prisma.passwordResetToken.updateMany({ where: { userId: t.user.id, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
  await prisma.session.updateMany({ where: { userId: t.user.id, revokedAt: null }, data: { revokedAt: now } });
  await writeAuditLog({ actorUserId: t.user.id, action: "PASSWORD_RESET_BY_EMAIL", entityType: "User", entityId: t.user.id });
  return NextResponse.json({ ok: true });
}
