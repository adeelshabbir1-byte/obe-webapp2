import { NextResponse } from "next/server";
import { getSignedInUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { withErrors } from "../../../lib/apiHandler";
import { reportServerError } from "../../../lib/monitoring";
import { hitLimit, ipOf, tooMany } from "../../../lib/rateLimit";
import { scrubText, scrubUrl } from "../../../lib/scrub";

export const dynamic = "force-dynamic";

// A page crashed: file it as a PROBLEM in System Feedback (seen by the Super User) with its reference code, and write the
// same code to the log (and Sentry when it is on). Limited to 20 reports per person (or address) per hour.
async function POST_handler(req: Request) {
  const user = await getSignedInUser().catch(() => null);
  const limit = await hitLimit(`report:${user?.id || ipOf(req.headers) || "anon"}`, 20, 3600_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const b = await req.json().catch(() => ({}));
  const ref = /^E-[A-Za-z0-9]{4,12}$/.test(String(b.ref || "")) ? String(b.ref) : `E-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const url = scrubUrl(String(b.url || "")).slice(0, 300);
  const message = scrubText(String(b.message || "Unknown error")).slice(0, 500);
  const chairmanId = user ? await chairmanIdFor(user).catch(() => null) : null;
  if (!b.note) await reportServerError(Object.assign(new Error(message), { name: "PageError" }), { ref, route: url, kind: b.digest ? "page-server" : "page-client", userId: user?.id, role: user?.role, institute: chairmanId });
  if (!user) return NextResponse.json({ ok: true, ref, filed: false });
  // One report per person per page per hour is enough (a note is always added).
  const dup = await prisma.systemFeedback.findFirst({ where: { userId: user.id, category: "PROBLEM", pageUrl: url, createdAt: { gte: new Date(Date.now() - 3600000) } } });
  if (dup && !b.note) return NextResponse.json({ ok: true, ref, duplicate: true });
  await prisma.systemFeedback.create({ data: {
    userId: user.id, chairmanId: chairmanId || null, role: user.role, category: "PROBLEM", pageUrl: url,
    title: `Page error ${ref}: ${url.slice(0, 120)}`,
    body: `Automatic error report.\nReference: ${ref}\nTime: ${new Date().toISOString()}\nPage: ${url}\nError: ${message}\nServer digest: ${String(b.digest || "-")}\nBrowser: ${String(req.headers.get("user-agent") || "").slice(0, 200)}\n${b.note ? `\nUser's note: ${scrubText(String(b.note)).slice(0, 1000)}` : ""}\n\n${scrubText(String(b.stack || "")).slice(0, 2000)}`,
  } });
  return NextResponse.json({ ok: true, ref });
}
export const POST = withErrors(POST_handler);
