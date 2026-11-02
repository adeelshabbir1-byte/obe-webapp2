import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { sideOf } from "../../../../lib/affWork";
import { obeTranscript } from "../../../../lib/uniObe";
import { PdfDoc } from "../../../../lib/pdfDoc";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET ?student= — the OBE transcript of an affiliated college's student: issued by the university, or an internal copy
// for the college (its own students only).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const inst = await chairmanIdFor(user as never);
  const s = await sideOf(user as never, inst);
  const studentId = String(req.nextUrl.searchParams.get("student") || "");
  if (!s.universityId || (!s.asUni && !s.asCollege)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!s.asUni && !(await prisma.student.findFirst({ where: { id: studentId, batch: { coordinator: { managedById: inst } } }, select: { id: true } }))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const t = await obeTranscript(s.universityId, studentId);
  if (!t.student) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const pdf = await PdfDoc.create(`${t.university} — OBE transcript`);
  await pdf.image(t.logo, 60);
  pdf.title("OBE transcript", `${t.university}${s.asUni ? "" : " · INTERNAL COPY — the university issues the official transcript"}`);
  pdf.kv([["Student", t.student.name], ["Registration no.", t.regNo || "not confirmed"], ["College roll no.", t.student.rollNumber], ["Program", `${t.student.batch.degreeProgram} ${t.student.batch.batchName}`], ["College", t.college], ["Date", new Date().toLocaleDateString("en-GB")]]);
  pdf.text("Graduate attributes", { bold: true, gap: 8 });
  pdf.table([["Attribute", 90], ["Average", 70], ["Status", 90], ["Courses", 260]], t.overall.map((g) => [g.ga, `${g.pct}%`, g.attained ? "Attained" : "Not attained", g.courses.join(", ")]), { size: 9 });
  pdf.text("Courses and learning outcomes", { bold: true, gap: 8 });
  pdf.table([["Term", 70], ["Course", 170], ["Total", 50], ["CLOs", 220]], t.courses.map((c) => [c.term || "", `${c.courseCode} ${c.courseTitle || ""}`, c.totalPct == null ? "—" : `${c.totalPct}%`, c.clos.map((x) => `${x.code} ${x.pct == null ? "n/a" : `${x.pct}% ${x.status === "CLEARED" ? "met" : "not met"}`}`).join("  ")]), { size: 8 });
  pdf.note("A CLO is cleared at the course's pass mark; a graduate attribute is attained when the average of its CLOs across courses is at least 50%. Sessional marks are the college's; the final and other university parts are the university's.");
  return new NextResponse(new Uint8Array(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="OBE-transcript-${(t.regNo || t.student.rollNumber).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf"` } });
}
export const GET = withErrors(GET_handler);
