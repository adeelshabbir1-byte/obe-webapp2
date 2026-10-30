import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { schemeAccess } from "../../../lib/degreeScheme";
import { parentLink, revokeParentLinks } from "../../../lib/parentLink";
import { prisma } from "../../../lib/db";
import { withErrors } from "../../../lib/apiHandler";

// POST { studentId?, action: "create" | "revoke" } — by the student, or their advisor / program staff.
async function POST_handler(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const self = await getAuthenticatedStudent().catch(() => null);
  const access = self && !b.studentId ? { studentId: self.id, actorId: self.id } : await schemeAccess(b.studentId ? String(b.studentId) : null);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if (b.action === "revoke") { await revokeParentLinks(access.studentId); return NextResponse.json({ ok: true, message: "Turned off. A new link can be made any time." }); }
    const token = await parentLink(access.studentId, access.actorId);
    const url = `${req.nextUrl.origin}/parent/${token}`;
    const phone = (await (prisma as unknown as Record<string, any>).studentContact.findUnique({ where: { studentId: access.studentId }, select: { guardianPhone: true } }).catch(() => null))?.guardianPhone || "";
    const wa = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(`Attendance, results and fees: ${url}`)}` : "";
    return NextResponse.json({ ok: true, message: wa ? `${url}   ·   WhatsApp to guardian: ${wa}` : url });
  } catch { return NextResponse.json({ error: "Run prisma/migration_platform_plus.sql in Supabase first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
