import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { hitLimit, ipOf, tooMany } from "../../../../lib/rateLimit";
import { withErrors } from "../../../../lib/apiHandler";

// Self-service password reset for staff: a one-time link, valid for 30 minutes, sent to the email on the account.
// The answer is the same whether or not the account exists, so the form can't be used to find out who has one.
// Students have no email on file; their Program Lead resets them to their roll number instead.

const TTL_MIN = 30;
const PER_ACCOUNT_PER_HOUR = 3;
const PER_IP_PER_HOUR = 10;
const ipHits = new Map<string, number[]>();

const GENERIC = "If that account has an email address and email is set up, a reset link is on its way. It works once, for 30 minutes. No email? Ask the person who manages your account: teachers their Program Lead, everyone else the Institute Head.";

function ipAllowed(ip: string) {
  const now = Date.now();
  const recent = (ipHits.get(ip) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 5000) ipHits.delete(ipHits.keys().next().value as string);
  return recent.length <= PER_IP_PER_HOUR;
}

/** The address links point to. Configured, never taken from the request's Host header (which a caller controls). */
function appBase(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? "" : req.nextUrl.origin;
}

async function POST_handler(req: NextRequest) {
  // Public endpoint: at most 10 requests per address per 60 minutes.
  { const lim = await hitLimit(`forgot:${ipOf(req.headers)}`, 10, 3600_000); if (!lim.ok) return tooMany(lim.retryAfter); }
  const b = await req.json().catch(() => ({}));
  const identifier = String(b.identifier ?? "").trim().slice(0, 200);
  if (!identifier) return NextResponse.json({ error: "Enter your login name or email." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (!ipAllowed(ip)) return NextResponse.json({ ok: true, message: GENERIC });

  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, base = appBase(req);
  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: { equals: identifier, mode: "insensitive" } }] }, select: { id: true, name: true, email: true, isActive: true } });
  if (!user || !user.isActive || !user.email || !key || !from || !base) return NextResponse.json({ ok: true, message: GENERIC });

  try {
    const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= PER_ACCOUNT_PER_HOUR) return NextResponse.json({ ok: true, message: GENERIC });
    const raw = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    // A new link replaces any earlier one that hasn't been used.
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + TTL_MIN * 60_000) } });
    const url = `${base}/reset-password?token=${raw}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [user.email], subject: "Reset your OBEHUB password",
        text: `Dear ${user.name},\n\nSomeone (hopefully you) asked to reset the password of your OBEHUB account. Open this link within ${TTL_MIN} minutes to choose a new password:\n\n${url}\n\nThe link works once. If you didn't ask for this, ignore this email — your password stays as it is.`,
      }),
    }).catch(() => null);
    await writeAuditLog({ actorUserId: user.id, action: res?.ok ? "PASSWORD_RESET_LINK_SENT" : "PASSWORD_RESET_EMAIL_FAILED", entityType: "User", entityId: user.id });
  } catch (e) {
    console.error("forgot-password", (e as Error).message);
  }
  return NextResponse.json({ ok: true, message: GENERIC });
}
export const POST = withErrors(POST_handler);
