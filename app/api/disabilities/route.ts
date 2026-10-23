import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, rdb, str, num, dateOrNull } from "../../../lib/registers";
import { DIS_HINT, CATEGORIES, keepsRegister, type Rec } from "../../../lib/disabilities";

/** GET ?report=xlsx — counts by category and program, no names (for HEC). Register keepers only. */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !(await keepsRegister(w) || w.leader)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const recs = (await rdb.disabilityRecord.findMany({ where: { chairmanId: w.chairmanId } }).catch(() => [])) as Rec[];
  const st = await prisma.student.findMany({ where: { id: { in: recs.map((r) => r.studentId).concat(["none"]) } }, select: { id: true, status: true, batch: { select: { degreeProgram: true } } } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students with disabilities");
  const programs = Array.from(new Set(st.map((s) => s.batch.degreeProgram))).sort();
  ws.addRow(["Category", ...programs, "Total", "With extra exam time"]).font = { bold: true };
  for (const c of CATEGORIES) {
    const rs = recs.filter((r) => r.category === c);
    if (!rs.length) continue;
    ws.addRow([c, ...programs.map((p) => rs.filter((r) => st.find((s) => s.id === r.studentId)?.batch.degreeProgram === p).length), rs.length, rs.filter((r) => r.extraTimePct > 0).length]);
  }
  ws.addRow(["All", ...programs.map((p) => st.filter((s) => s.batch.degreeProgram === p).length), recs.length, recs.filter((r) => r.extraTimePct > 0).length]).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 20; });
  return new NextResponse((await wb.xlsx.writeBuffer()) as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Students with disabilities ${new Date().getFullYear()}.xlsx"` } });
}

/** POST { action: "save", studentId (or rollNumber), category, details, extraTimePct, seating, materials, assistive, other, validUntil, verified }
 *  POST { action: "remove", studentId } — register keepers only. */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !(await keepsRegister(w))) return NextResponse.json({ error: "Only the disability focal person, Student Affairs or the institute head keeps the register." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const st = await prisma.student.findFirst({ where: { batch: { coordinator: { managedById: w.chairmanId } }, ...(b.studentId ? { id: String(b.studentId) } : { rollNumber: str(b.rollNumber, 40) || "-" }) }, select: { id: true, name: true, rollNumber: true } });
    if (!st) return NextResponse.json({ error: "Student not found (check the roll number)." }, { status: 404 });
    if (b.action === "remove") { await rdb.disabilityRecord.deleteMany({ where: { studentId: st.id, chairmanId: w.chairmanId } }); await writeAuditLog({ actorUserId: w.id, action: "DISABILITY_RECORD_REMOVED", entityType: "DisabilityRecord", entityId: st.id, metadata: {} }); return NextResponse.json({ ok: true }); }
    const category = CATEGORIES.includes(String(b.category)) ? String(b.category) : "Other";
    const data = { category, details: str(b.details, 3000) || null, extraTimePct: Math.min(Math.max(num(b.extraTimePct) ?? 0, 0), 100), seating: str(b.seating, 200) || null, materials: str(b.materials, 200) || null, assistive: str(b.assistive, 200) || null, other: str(b.other, 1000) || null, validUntil: dateOrNull(b.validUntil), verified: !!b.verified, recordedById: w.id, updatedAt: new Date() };
    const had = await rdb.disabilityRecord.findUnique({ where: { studentId: st.id } });
    await rdb.disabilityRecord.upsert({ where: { studentId: st.id }, create: { studentId: st.id, chairmanId: w.chairmanId, ...data }, update: data });
    await writeAuditLog({ actorUserId: w.id, action: had ? "DISABILITY_RECORD_UPDATED" : "DISABILITY_RECORD_ADDED", entityType: "DisabilityRecord", entityId: st.id, metadata: {} });
    // Tell the student's current teachers (accommodations only — no category or details).
    const enr = await prisma.studentEnrollment.findMany({ where: { studentId: st.id, status: "ACTIVE", course: { isOffered: true } }, select: { course: { select: { instructorId: true, code: true } } } });
    await notifyUsers(enr.map((e) => e.course.instructorId), { kind: "ACCOMMODATION", title: `${st.name} (${st.rollNumber}) has exam / class accommodations`, body: "See Student Accommodations for what to provide.", href: "/accommodations", exceptId: w.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? DIS_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
