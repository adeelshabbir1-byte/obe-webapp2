import { NextResponse } from "next/server";
import { getSignedInUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";

export const dynamic = "force-dynamic";

// A page crashed: file it as a PROBLEM in System Feedback (seen by the Super User), with the page, error and time.
export async function POST(req: Request) {
  const user = await getSignedInUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const url = String(b.url || "").slice(0, 300);
  const message = String(b.message || "Unknown error").slice(0, 500);
  // One report per person per page per hour is enough.
  const dup = await prisma.systemFeedback.findFirst({ where: { userId: user.id, category: "PROBLEM", pageUrl: url, createdAt: { gte: new Date(Date.now() - 3600000) } } });
  if (dup && !b.note) return NextResponse.json({ ok: true, duplicate: true });
  const chairmanId = await chairmanIdFor(user).catch(() => null);
  await prisma.systemFeedback.create({ data: {
    userId: user.id, chairmanId: chairmanId || null, role: user.role, category: "PROBLEM", pageUrl: url,
    title: `Page error: ${url.replace(/^https?:\/\/[^/]+/, "").slice(0, 120)}`,
    body: `Automatic error report.\nTime: ${new Date().toISOString()}\nPage: ${url}\nError: ${message}\nCode: ${String(b.digest || "-")}\nBrowser: ${String(req.headers.get("user-agent") || "").slice(0, 200)}\n${b.note ? `\nUser's note: ${String(b.note).slice(0, 1000)}` : ""}\n\n${String(b.stack || "").slice(0, 2000)}`,
  } });
  return NextResponse.json({ ok: true });
}
