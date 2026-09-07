import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "./db";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_DAYS = 7;

export async function createSession(userId: string, ip?: string, userAgent?: string, mfaVerified = true) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { userId, tokenHash, expiresAt, ipAddress: ip, userAgent, mfaVerified } });

  cookies().set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function markSessionMfaVerified() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const result = await prisma.session.updateMany({ where: { tokenHash }, data: { mfaVerified: true } });
  return result.count > 0;
}

export async function destroySession() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (raw) {
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    await prisma.session.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }
  cookies().delete(SESSION_COOKIE);
}

export async function getAuthenticatedUser() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const { passwordHash, ...safeUser } = session.user;
  // A dual-capable Subject Expert's chosen role for this session overrides
  // their stored role everywhere else in the app checks `user.role` —
  // rawRole/secondaryRole stay available for the few places (onboarding,
  // the choice screen itself, dropdowns) that need the true picture.
  const effectiveRole = session.activeRole || safeUser.role;
  return { ...safeUser, role: effectiveRole, rawRole: safeUser.role, roleChosen: !!session.activeRole, mfaVerified: session.mfaVerified };
}

/** Called from the role-choice screen once a dual-capable person picks
 * which role to act as for this session. */
export async function setActiveRole(role: string) {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const result = await prisma.session.updateMany({ where: { tokenHash }, data: { activeRole: role } });
  return result.count > 0;
}
