import { prisma } from "./db";

// Sign-in throttling by network address, on top of the per-account lock-out (lib/auth.ts) and the per-roll-number
// limit (student login): one address may fail at most 30 sign-ins in 15 minutes, across all accounts, so guessing
// many accounts from one place is stopped too. Failures are counted from the audit log (works on serverless).
export const IP_MAX_FAILS = 30;
export const ipOf = (h: Headers) => (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "";

export async function ipBlocked(ip: string) {
  if (!ip) return false;
  const n = await prisma.auditLog.count({
    where: { action: { in: ["LOGIN_FAILED", "ACCOUNT_TEMP_LOCKED", "STUDENT_LOGIN_FAILED"] }, createdAt: { gte: new Date(Date.now() - 15 * 60_000) }, metadata: { path: ["ip"], equals: ip } },
  }).catch(() => 0);
  return n >= IP_MAX_FAILS;
}
