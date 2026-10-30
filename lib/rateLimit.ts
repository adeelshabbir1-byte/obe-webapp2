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

// General request limits (password reset, Report a problem, public endpoints): at most `max` hits per `key` in
// `windowMs`, counted in a small side table so it works across serverless instances. If the table is missing the
// request is allowed (never lock people out because of a pending migration).
const rdb = prisma as unknown as Record<string, any>;
export async function hitLimit(key: string, max: number, windowMs: number): Promise<{ ok: boolean; retryAfter: number }> {
  try {
    const since = new Date(Date.now() - windowMs);
    const n = await rdb.rateLimitHit.count({ where: { key, at: { gte: since } } });
    if (n >= max) return { ok: false, retryAfter: Math.ceil(windowMs / 1000) };
    await rdb.rateLimitHit.create({ data: { key } });
    // Old rows are cleared now and then.
    if (Math.random() < 0.02) await rdb.rateLimitHit.deleteMany({ where: { at: { lt: new Date(Date.now() - 24 * 3600_000) } } }).catch(() => null);
    return { ok: true, retryAfter: 0 };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}
/** The JSON 429 reply for a refused request. */
export const tooMany = (retryAfter: number) => new Response(JSON.stringify({ error: "Too many requests — please wait a few minutes and try again." }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } });
