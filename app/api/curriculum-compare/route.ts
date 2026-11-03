import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { batchDiff } from "../../../lib/curriculumDiff";
import { PdfDoc } from "../../../lib/pdfDoc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// The CLO and topic comparison of one batch, as a PDF for the Board of Studies.
export async function GET(req: NextRequest) {
  const u = await getAuthenticatedUser();
  if (!u || !u.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await prisma.batch.findUnique({ where: { id: String(req.nextUrl.searchParams.get("batch") || "") }, select: { id: true, degreeProgram: true, batchName: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
  if (!b || (b.coordinatorId !== u.id && b.coordinator.managedById !== (await chairmanIdFor(u as never)))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const rows = await batchDiff(b.id);
  const pdf = await PdfDoc.create(`${b.degreeProgram} ${b.batchName} - curriculum comparison`);
  pdf.title("Curriculum comparison — CLOs and topics", `${b.degreeProgram} — ${b.batchName} · against the national master · ${new Date().toISOString().slice(0, 10)}`);
  const changed = rows.filter((r) => r.total > 0);
  pdf.text(`${changed.length} of ${rows.length} courses differ from the master at CLO or topic level.`, { bold: true });
  for (const r of changed) {
    pdf.h2(`${r.code} ${r.title} (master ${r.masterCode})${r.lastBy ? ` — last changed by ${r.lastBy}${r.lastAt ? `, ${new Date(r.lastAt).toISOString().slice(0, 10)}` : ""}` : ""}`);
    for (const [k, d] of [["CLOs", r.clo], ["Topics", r.topics]] as const) {
      if (!(d.added.length + d.removed.length + d.changed.length)) continue;
      pdf.table([[k, 14], ["Master", 43], ["This batch", 43]], [...d.changed.map((x) => ["changed", x.from, x.to]), ...d.added.map((x) => ["added", "", x]), ...d.removed.map((x) => ["removed", x, ""])]);
    }
  }
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="curriculum-comparison-${b.batchName.replace(/[^\w-]+/g, "-")}.pdf"` } });
}
