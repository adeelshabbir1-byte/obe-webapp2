import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { edb } from "../../../../lib/erp";
import { hitLimit, ipOf, tooMany } from "../../../../lib/rateLimit";
import { withErrors } from "../../../../lib/apiHandler";

const clip = (v: unknown, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// The public inquiry form on the institute's website feeds the admission CRM.
async function POST_handler(req: Request) {
  // Public endpoint: at most 10 requests per address per 60 minutes.
  { const lim = await hitLimit(`admission:${ipOf(req.headers)}`, 10, 3600_000); if (!lim.ok) return tooMany(lim.retryAfter); }
  const b = await req.json().catch(() => ({}));
  const head = await prisma.user.findFirst({ where: { id: String(b.institute || ""), role: "CHAIRMAN" as never }, select: { id: true } });
  if (!head) return NextResponse.json({ error: "Unknown institute." }, { status: 404 });
  const name = clip(b.name, 100), phone = clip(b.phone, 30), email = clip(b.email);
  if (!name || !(phone || email) || b.website) return NextResponse.json({ error: "Please give your name and a phone number or email." }, { status: 400 }); // "website" is a hidden trap field for bots
  const recent = await edb.admissionLead.count({ where: { chairmanId: head.id, OR: [{ phone: phone || "-" }, { email: email || "-" }], createdAt: { gte: new Date(Date.now() - 86400000) } } }).catch(() => 0);
  if (recent) return NextResponse.json({ ok: true });
  try {
    const lead = await edb.admissionLead.create({ data: { chairmanId: head.id, name, phone, email, city: clip(b.city, 60), program: clip(b.program, 100), source: "Website", notes: clip(b.message, 1000), nextFollowUp: new Date(Date.now() + 86400000) } });
    await edb.leadActivity.create({ data: { leadId: lead.id, kind: "NOTE", text: "Inquiry from the website", byId: "public" } });
  } catch { return NextResponse.json({ error: "Inquiries are not open yet." }, { status: 503 }); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
