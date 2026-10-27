import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { ensureBatchSections, getMaxSection, moveStudent, sectionOfStudents } from "../../../../lib/studentSections";
import { timetableScopeFor } from "../../../../lib/timetableScope";
import { writeAuditLog } from "../../../../lib/audit";

// A batch's student sections (Section A, B, … of at most the limit) and who is in which — for the Student Directory.
// The batch's Program Lead, or the Department Coordinator of its department.
async function access(batchId: string) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, coordinatorId: true, coordinator: { select: { departmentId: true, managedById: true } } } });
  if (!b) return null;
  const real = user.realUserId && user.realUserId !== user.id ? await prisma.user.findUnique({ where: { id: user.realUserId }, select: { id: true, role: true, departmentId: true, managedById: true } }) : null;
  const dc = (real || user).role === "DEPARTMENT_COORDINATOR" && (real || user).departmentId === b.coordinator.departmentId && (real || user).managedById === b.coordinator.managedById;
  if (b.coordinatorId !== user.id && !dc) return null;
  const max = await getMaxSection(b.coordinator.managedById || "", (await timetableScopeFor({ id: b.coordinatorId, managedById: b.coordinator.managedById })).key);
  return { user, batch: b, max };
}

/** GET ?batchId= — the sections with their sizes, and each student's section. */
export async function GET(req: Request) {
  const a = await access(new URL(req.url).searchParams.get("batchId") || "");
  if (!a) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sections = await ensureBatchSections(a.batch.id, a.max);
  const students = await prisma.student.findMany({ where: { batchId: a.batch.id, status: "ACTIVE" }, select: { id: true } });
  const of = await sectionOfStudents(students.map((s) => s.id));
  const counts = Object.fromEntries(sections.map((s) => [s.label, students.filter((x) => of.get(x.id) === s.label).length]));
  return NextResponse.json({ max: a.max, sections: sections.map((s) => ({ ...s, students: counts[s.label] || 0 })), sectionOf: Object.fromEntries(of) });
}

/** POST { batchId, studentId, label } — move one student to another section (refused when it is full). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const a = await access(String(body.batchId || ""));
  if (!a) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const st = await prisma.student.findUnique({ where: { id: String(body.studentId || "") }, select: { id: true, batchId: true, name: true } });
  if (!st || st.batchId !== a.batch.id) return NextResponse.json({ error: "Student not found in this batch." }, { status: 404 });
  try { await moveStudent(st.id, String(body.label || ""), a.max); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  await writeAuditLog({ actorUserId: a.user.id, action: "STUDENT_SECTION_MOVED", entityType: "Student", entityId: st.id, metadata: { label: String(body.label) } }).catch(() => null);
  return NextResponse.json({ ok: true, message: `${st.name} is now in Section ${body.label}.` });
}
