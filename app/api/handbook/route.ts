import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import { articlesFor } from "../../../lib/help/access";
import { pageMatch } from "../../../lib/help/search";
import { forAudience } from "../../../lib/help/types";
import { PdfDoc } from "../../../lib/pdfDoc";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET ?role= — the role handbook (Adeel prompt §16), built fresh at download time from the "?" help of every page in
// that role's menu: purpose, who uses it, the steps. Pages without help are listed as "help not written yet". Cover:
// institute name and logo, role, date and app version. Staff download their own role; leaders any role.
const LEADERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "SUPER_USER"];
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const role = String(req.nextUrl.searchParams.get("role") || user.role);
  const mine = [user.role, (user as { secondaryRole?: string }).secondaryRole, (user as { tertiaryRole?: string }).tertiaryRole].filter(Boolean);
  if (!LEADERS.includes(user.role) && !mine.includes(role)) return NextResponse.json({ error: "You can download your own role's handbook." }, { status: 403 });
  const cid = await chairmanIdFor(user as never).catch(() => "");
  const inst = cid ? await prisma.user.findUnique({ where: { id: cid }, select: { instituteName: true, instituteLogo: true } }) : null;
  const all = await articlesFor(cid || null);
  const pages = navForRole(role);
  const pdf = await PdfDoc.create(`${inst?.instituteName || "OBEHUB"} — ${roleLabel(role)} handbook`);
  await pdf.image(inst?.instituteLogo, 70);
  pdf.title(`${roleLabel(role)} handbook`, `${inst?.instituteName || "OBEHUB"} · ${new Date().toLocaleDateString("en-GB")} · version ${(process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 8)}`);
  pdf.text("Contents", { bold: true, gap: 8 });
  pages.forEach((p, i) => pdf.text(`${i + 1}. ${p.label}`, { size: 9 }));
  const missing: string[] = [];
  for (const [i, p] of pages.entries()) {
    const arts = all.filter((a) => forAudience(a, role) && pageMatch(a, p.href) > 0).slice(0, 3);
    pdf.text(`${i + 1}. ${p.label}`, { bold: true, size: 12, gap: 14 });
    pdf.note(p.href);
    if (!arts.length) { pdf.text("Help not written yet.", { size: 9 }); missing.push(p.href); continue; }
    for (const a of arts) {
      pdf.text(a.title, { bold: true, size: 10, gap: 6 });
      pdf.text(a.summary, { size: 9 });
      if (a.who) pdf.text(`Who: ${a.who}`, { size: 9 });
      (a.steps || []).forEach((s, j) => pdf.text(`${j + 1}. ${s}`, { size: 9, indent: 10 }));
    }
  }
  // Pages without help also go to the admin's missing-help list (as "no page help" searches).
  for (const page of missing.slice(0, 40)) await prisma.helpSearchLog.create({ data: { chairmanId: cid || null, role, query: "(no page help)", results: 0, page } }).catch(() => null);
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${roleLabel(role).replace(/\s+/g, "-")}-handbook.pdf"` } });
}
export const GET = withErrors(GET_handler);
