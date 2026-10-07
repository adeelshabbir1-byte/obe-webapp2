import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Gives an existing teacher an extra role - Dean, Chairman of a department, or Program Lead - or takes it back.
// The person keeps teaching and chooses which hat to wear when they sign in.
// The Institute Head can do all three; a Chairman can only name Program Leads inside their own department.
type Wanted = "DEAN" | "HEAD_OF_DEPARTMENT" | "PROGRAM_LEAD";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const isInstituteHead = user.role === "CHAIRMAN";
  const chairmanId = isInstituteHead ? user.id : user.managedById || "";
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "choose a person" }, { status: 400 });

  // ---- take a role back ----
  if (body.action === "REVOKE") {
    const holder = await prisma.user.findFirst({ where: { id: body.userId, role: { in: ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"] }, secondaryRole: "INSTRUCTOR", managedById: chairmanId } });
    if (!holder) return NextResponse.json({ error: "this person did not get their role from a teacher account" }, { status: 404 });
    if (!isInstituteHead && !(holder.role === "PROGRAM_COORDINATOR" && holder.departmentId === user.departmentId)) return NextResponse.json({ error: "you can only take back a Program Lead role in your own department" }, { status: 403 });
    // Back under one of their department's coordinators when there is one.
    const manager = holder.departmentId ? await prisma.user.findFirst({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: holder.departmentId, id: { not: holder.id } }, orderBy: { createdAt: "asc" } }) : null;
    await prisma.user.update({ where: { id: holder.id }, data: { role: "INSTRUCTOR", secondaryRole: null, leadProgram: null, facultyId: null, managedById: manager?.id || chairmanId } });
    await prisma.session.updateMany({ where: { userId: holder.id }, data: { activeRole: null } });
    await writeAuditLog({ actorUserId: user.id, action: "TEACHER_ROLE_REVOKED", entityType: "User", entityId: holder.id, metadata: { was: holder.role } });
    return NextResponse.json({ ok: true });
  }

  // ---- give a role ----
  const wanted = body.role as Wanted;
  if (!["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_LEAD"].includes(wanted)) return NextResponse.json({ error: "choose a role" }, { status: 400 });
  if (!isInstituteHead && wanted !== "PROGRAM_LEAD") return NextResponse.json({ error: "only the Institute Head can name a Dean or a Chairman" }, { status: 403 });

  const teacher = await prisma.user.findFirst({
    where: { id: body.userId, isVisitingPlaceholder: false, OR: [{ managedBy: { managedById: chairmanId } }, { managedById: chairmanId }], role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } },
  });
  if (!teacher) return NextResponse.json({ error: "teacher not found" }, { status: 404 });
  if (teacher.role === "SUBJECT_EXPERT") return NextResponse.json({ error: `${teacher.name} is a Subject Expert. Taking another role would remove their Subject Expert screens, so choose a teacher who is an Instructor.` }, { status: 400 });
  if (!isInstituteHead && teacher.departmentId !== user.departmentId) return NextResponse.json({ error: "you can only choose teachers from your own department" }, { status: 403 });

  if (wanted === "DEAN") {
    const faculty = body.facultyId ? await prisma.faculty.findFirst({ where: { id: body.facultyId, chairmanId } }) : null;
    if (!faculty) return NextResponse.json({ error: "choose a faculty" }, { status: 400 });
    await prisma.user.update({ where: { id: teacher.id }, data: { role: "DEAN", secondaryRole: "INSTRUCTOR", facultyId: faculty.id, managedById: chairmanId } });
  } else if (wanted === "HEAD_OF_DEPARTMENT") {
    const dept = body.departmentId ? await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId } }) : null;
    if (!dept) return NextResponse.json({ error: "choose a department" }, { status: 400 });
    await prisma.user.update({ where: { id: teacher.id }, data: { role: "HEAD_OF_DEPARTMENT", secondaryRole: "INSTRUCTOR", departmentId: dept.id, managedById: chairmanId } });
  } else {
    const program = typeof body.program === "string" ? body.program : "";
    const owner = program ? await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: program, ...(isInstituteHead ? {} : { departmentId: user.departmentId || "none" }) } }) : null;
    if (!owner) return NextResponse.json({ error: "choose one of the department's programs" }, { status: 400 });
    // One lead per program: whoever led it before stops being its lead.
    await prisma.user.updateMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: owner.departmentId, leadProgram: program, id: { not: teacher.id } }, data: { leadProgram: null } });
    await prisma.user.update({ where: { id: teacher.id }, data: { role: "PROGRAM_COORDINATOR", secondaryRole: "INSTRUCTOR", leadProgram: program, departmentId: owner.departmentId, managedById: chairmanId } });
  }
  await prisma.session.updateMany({ where: { userId: teacher.id }, data: { activeRole: null } });
  await writeAuditLog({ actorUserId: user.id, action: "TEACHER_ROLE_GIVEN", entityType: "User", entityId: teacher.id, metadata: { role: wanted, facultyId: body.facultyId || null, departmentId: body.departmentId || null, program: body.program || null } });
  return NextResponse.json({ ok: true });
}
