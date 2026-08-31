import argon2 from "argon2";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export async function attemptLogin(usernameOrEmail: string, password: string, ip?: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }] },
  });

  const genericFailure = { ok: false as const, reason: "invalid_credentials" as const };

  if (!user || !user.isActive) {
    await writeAuditLog({ action: "LOGIN_FAILED", metadata: { reason: "not_found_or_inactive" } });
    return genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await writeAuditLog({ actorUserId: user.id, action: "LOGIN_BLOCKED_LOCKOUT" });
    return { ok: false as const, reason: "temporarily_locked" as const };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failedCount = user.failedLoginCount + 1;
    const locked = failedCount >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failedCount,
        lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    await writeAuditLog({ actorUserId: user.id, action: locked ? "ACCOUNT_TEMP_LOCKED" : "LOGIN_FAILED" });
    return genericFailure;
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await writeAuditLog({ actorUserId: user.id, action: "LOGIN_SUCCESS", metadata: { ip: ip ?? null } });

  const { passwordHash, ...safeUser } = user;
  return { ok: true as const, user: safeUser };
}
