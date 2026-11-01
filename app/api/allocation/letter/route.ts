import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { yearCardOf } from "../../../../lib/yearPlan";
import { PdfDoc } from "../../../../lib/pdfDoc";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// The teacher's allocation letter for the year (Adeel prompt §25.13), with the institute's logo.
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const card = await yearCardOf(user.id, cid);
  if (!card.length) return NextResponse.json({ error: "No approved allocation for you yet." }, { status: 404 });
  const inst = await prisma.user.findUnique({ where: { id: cid }, select: { instituteName: true, instituteLogo: true } });
  const pdf = await PdfDoc.create(`${inst?.instituteName || "OBEHUB"} — teaching allocation`);
  await pdf.image(inst?.instituteLogo, 60);
  pdf.title("Teaching allocation", `${user.name} · ${card[0].plan.yearLabel} · approved ${card[0].plan.approvedAt ? new Date(card[0].plan.approvedAt).toLocaleDateString("en-GB") : ""}`);
  for (const c of card) {
    const terms = Array.from(new Set(c.rows.map((r) => r.term)));
    for (const t of terms) {
      const rs = c.rows.filter((r) => r.term === t);
      pdf.text(`${t}${rs[0]?.summer ? " (tentative)" : ""}`, { bold: true, gap: 8 });
      pdf.table([["Course", 220], ["Batch", 160], ["Sections", 70]], rs.map((r) => [`${r.code} ${r.title}`, r.batch, r.mine]), { size: 9 });
      pdf.note(`Sections this term: ${rs.reduce((a, r) => a + r.mine, 0)}`);
    }
  }
  pdf.text(" ", { gap: 20 });
  pdf.text("Please acknowledge on your year card in OBEHUB, or raise a concern within 3 working days.", { size: 9 });
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="allocation-${user.name.replace(/\s+/g, "-")}.pdf"` } });
}
export const GET = withErrors(GET_handler);
