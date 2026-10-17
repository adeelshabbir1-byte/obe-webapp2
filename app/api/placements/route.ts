import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import { cdb } from "../../../lib/complexProblems";
import { KINDS, SALARY } from "../../../lib/placements";
import { chairmanIdFor } from "../../../lib/reportScope";

const s = (v: unknown, n = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const STAFF = ["CHAIRMAN", "PROGRAM_COORDINATOR", "STUDENT_AFFAIRS", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR"];

// Students record their own internships and jobs; placement staff add records for anyone and verify them.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const st = await getAuthenticatedStudent();
  const user = st ? null : await getAuthenticatedUser();
  let studentId = st?.id || "";
  if (!st) {
    if (!user || !user.mfaVerified || !STAFF.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const cid = await chairmanIdFor(user);
    const target = b.studentId ? await prisma.student.findFirst({ where: { id: String(b.studentId), batch: { coordinator: { managedById: cid } } }, select: { id: true } })
      : b.rollNumber ? await prisma.student.findFirst({ where: { rollNumber: String(b.rollNumber).trim(), batch: { coordinator: { managedById: cid } } }, select: { id: true } }) : null;
    if (!target && b.action !== "verify" && b.action !== "delete") return NextResponse.json({ error: "Student not found (check the roll number)." }, { status: 400 });
    studentId = target?.id || "";
    if (b.action === "verify" || b.action === "delete") {
      const p = await cdb.placement.findUnique({ where: { id: String(b.id || "") } });
      if (!p || !(await prisma.student.count({ where: { id: p.studentId, batch: { coordinator: { managedById: cid } } } }))) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (b.action === "verify") await cdb.placement.update({ where: { id: p.id }, data: { verifiedById: b.undo ? null : user.id } });
      else await cdb.placement.delete({ where: { id: p.id } });
      return NextResponse.json({ ok: true });
    }
  }
  try {
    if (b.action === "delete" && st) { await cdb.placement.deleteMany({ where: { id: String(b.id || ""), studentId, verifiedById: null } }); return NextResponse.json({ ok: true }); }
    const org = s(b.organization);
    if (!org || !KINDS.some((k) => k[0] === b.kind)) return NextResponse.json({ error: "Choose the type and give the organisation or university." }, { status: 400 });
    await cdb.placement.create({ data: { studentId, kind: b.kind, organization: org, position: s(b.position), city: s(b.city, 60), startDate: b.startDate ? new Date(b.startDate) : null, endDate: b.endDate ? new Date(b.endDate) : null, salaryBand: SALARY.some((x) => x[0] === b.salaryBand) ? b.salaryBand || null : null, inField: b.inField !== false, supervisorEmail: s(b.supervisorEmail, 160), createdById: user?.id || null, verifiedById: user ? user.id : null } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Run prisma/migration_teaching_extras.sql first." }, { status: 500 }); }
}
