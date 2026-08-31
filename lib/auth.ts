import crypto from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

// Password hashing via Node's built-in crypto.scrypt — deliberately NOT using
// a native-compiled module (like argon2) here, since those can fail to load
// on serverless platforms when the build environment's binary doesn't match
// the runtime environment exactly. scrypt is part of Node core, so this
// works identically everywhere with zero native dependencies.
const SCRYPT_KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(plain, salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    const [scheme, salt, hashHex] = storedHash.split(":");
    if (scheme !== "scrypt" || !salt || !hashHex) return false;
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(plain, salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
    });
    const storedBuffer = Buffer.from(hashHex, "hex");
    if (storedBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(storedBuffer, derivedKey);
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
