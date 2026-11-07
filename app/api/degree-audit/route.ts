import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { whoIs } from "../../../lib/registers";
import { canManageDegrees } from "../../../lib/degrees";
import { batchAudit, earlyWarnings, snapshotOf } from "../../../lib/degreeAuditOps";
import { saveSetting } from "../../../lib/scopedSettings";
import { PdfDoc } from "../../../lib/pdfDoc";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
// Queue item 16. GET ?batch=&format=csv — batch audit; GET ?snapshot=<studentId> — the signed audit as PDF.
// POST { action: warn {batchId} | mincgpa {value} } — the Controller.
async function guard() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  const w = await whoIs(user as never);
  return w && canManageDegrees(w) ? { user, w } : null;
}
async function GET_handler(req: NextRequest) {
  const g = await guard(); if (!g) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams;
  if (q.get("snapshot")) {
    const st = await prisma.student.findFirst({ where: { id: q.get("snapshot")!, batch: { coordinator: { managedById: g.w.chairmanId } } }, select: { id: true, name: true, rollNumber: true } });
    const s = st ? await snapshotOf(st.id) : null;
    if (!st || !s) return NextResponse.json({ error: "No signed audit for this student." }, { status: 404 });
    const pdf = await PdfDoc.create(`Degree audit · ${st.rollNumber}`);
    pdf.title("Degree audit at issue", `${st.name} · ${st.rollNumber} · ${s.audit.program}`);
    pdf.kv([["Signed by", s.signedByName], ["Signed on", s.at.toISOString().slice(0, 10)], ["Check code", s.hash], ["Transcript since issue", s.changed ? "CHANGED after the degree was issued" : "unchanged"]]);
    pdf.h2("Graduation checks");
    pdf.table([["Check", 330], ["Result", 60], ["Detail", 120]], s.audit.graduation.map((x) => [x.label, x.ok ? "Pass" : "Fail", x.detail || ""]));
    pdf.h2("Course types");
    pdf.table([["Type", 200], ["Required", 80], ["Passed", 80], ["In progress", 80]], s.audit.groups.map((x) => [x.type, x.required, x.passed, x.inProgress]));
    return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="degree-audit-${st.rollNumber}.pdf"` } });
  }
  const b = await prisma.batch.findFirst({ where: { id: q.get("batch") || "", coordinator: { managedById: g.w.chairmanId } }, select: { id: true, degreeProgram: true, batchName: true } });
  if (!b) return NextResponse.json({ error: "Choose a batch." }, { status: 400 });
  const rows = await batchAudit(b.id);
  if (q.get("format") === "csv") {
    const c = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const csv = [["Roll number", "Name", "Passes", "CGPA", "Courses still to take", "What fails"].map(c).join(","), ...rows.map((r) => [r.roll, r.name, r.eligible ? "yes" : "no", r.cgpa?.toFixed(2) ?? "", r.missing, r.failing.join("; ")].map(c).join(","))].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="degree-audit-${b.batchName.replace(/\W+/g, "-")}.csv"` } });
  }
  return NextResponse.json({ batch: b, rows });
}
async function POST_handler(req: NextRequest) {
  const g = await guard(); if (!g) return NextResponse.json({ error: "Only the Controller of Examinations." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === "mincgpa") {
    const v = Number(b.value); if (!(v > 0 && v <= 4)) return NextResponse.json({ error: "Enter a CGPA between 0 and 4." }, { status: 400 });
    await saveSetting(g.w.chairmanId, "INSTITUTE", g.w.chairmanId, "rules.graduateCgpa", String(v), g.user.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "warn") {
    const batch = await prisma.batch.findFirst({ where: { id: String(b.batchId || ""), coordinator: { managedById: g.w.chairmanId } }, select: { id: true } });
    if (!batch) return NextResponse.json({ error: "Choose a batch." }, { status: 400 });
    return NextResponse.json({ ok: true, sent: await earlyWarnings(batch.id, g.w.chairmanId) });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
