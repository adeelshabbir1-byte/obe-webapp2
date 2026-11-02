import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import { skillsOf } from "../../../lib/skillsTranscript";
import { PdfDoc } from "../../../lib/pdfDoc";

export const dynamic = "force-dynamic";
// The skills transcript as a PDF: the student for himself, or the institute's staff for one of its students.
export async function GET(req: NextRequest) {
  let id = req.nextUrl.searchParams.get("studentId") || "";
  const st = await getAuthenticatedStudent().catch(() => null);
  if (st && (!id || id === st.id)) id = st.id;
  else {
    const u = await getAuthenticatedUser();
    if (!u || !u.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const s = await prisma.student.findUnique({ where: { id }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
    if (!s || s.batch.coordinator.managedById !== (await chairmanIdFor(u as never))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const t = await skillsOf(id);
  if (!t) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const pdf = await PdfDoc.create(`${t.institute} - skills transcript - ${t.student.roll}`);
  pdf.title("Skills transcript", `${t.institute}`);
  pdf.kv([["Student", `${t.student.name} (${t.student.roll})`], ["Program", `${t.student.program} — ${t.student.batch}`], ["Courses counted", t.courses]]);
  pdf.h1("Graduate attributes");
  pdf.table([["GA", 8], ["Attribute", 46], ["Attainment", 14], ["Level", 16], ["Courses", 16]], t.gas.map((g) => [`GA-${g.number}`, g.title, `${g.pct}%`, g.level, g.courses.length]));
  pdf.note("Average of the courses on the transcript that measured each attribute. Levels: Excellent 80%+, Good 60%+, Satisfactory 50%+.");
  if (t.fyp.length) { pdf.h1("Final year project"); for (const f of t.fyp) pdf.text(`${f.title || f.group}${f.grade ? ` — grade ${f.grade}` : ""}`); }
  if (t.activities.length) { pdf.h1("Co-curricular activities"); pdf.table([["Society", 40], ["Type", 20], ["Role", 20], ["Term", 20]], t.activities.map((a) => [a.society, a.category.toLowerCase(), a.position, a.term])); }
  pdf.note(`Issued ${new Date().toISOString().slice(0, 10)} from OBEHUB records. The official grade transcript is issued separately.`);
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="skills-transcript-${t.student.roll}.pdf"` } });
}
