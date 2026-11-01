import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { dataOf, sideOf } from "../../../../lib/affWork";
import { PdfDoc } from "../../../../lib/pdfDoc";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// GET ?id= — the affiliation letter (Adeel prompt §29A) for an approved application, with the university's logo.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const inst = await chairmanIdFor(user as never);
  const s = await sideOf(user as never, inst);
  const r = await db.affRecord?.findUnique({ where: { id: String(req.nextUrl.searchParams.get("id") || "") } });
  if (!r || r.kind !== "APPLICATION" || !["APPROVED", "CONDITIONAL"].includes(r.status) || r.universityId !== s.universityId || (!s.asUni && r.collegeId !== inst)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const d = dataOf(r);
  const [uni, col] = await Promise.all([prisma.user.findUnique({ where: { id: r.universityId }, select: { instituteName: true, instituteLogo: true } }), r.collegeId ? prisma.user.findUnique({ where: { id: r.collegeId }, select: { instituteName: true, name: true } }) : null]);
  const pdf = await PdfDoc.create(`${uni?.instituteName || "University"} — affiliation`);
  await pdf.image(uni?.instituteLogo, 70);
  pdf.title(r.status === "APPROVED" ? "Letter of affiliation" : "Conditional affiliation", `${uni?.instituteName || ""} · ${new Date().toLocaleDateString("en-GB")}`);
  pdf.kv([["Institution", col?.instituteName || col?.name || ""], ["Application", d.type || ""], ["Programs", d.programs || ""], ["Seats", d.seats || ""], ["Approved by", d.authority || "Syndicate"], ["Valid until", d.validUntil || ""]]);
  if (r.status === "CONDITIONAL" && d.conditions) { pdf.text("Conditions", { bold: true, gap: 8 }); pdf.text(String(d.conditions), { size: 9.5 }); }
  pdf.text(" ", { gap: 30 });
  pdf.text("Registrar: ______________________          Date: __________", { size: 9.5 });
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="affiliation-letter.pdf"` } });
}
export const GET = withErrors(GET_handler);
