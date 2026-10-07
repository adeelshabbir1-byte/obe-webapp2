import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { hashPassword } from "../../../lib/auth";
import { writeAuditLog } from "../../../lib/audit";

// A Program Lead is the Program Coordinator who is responsible for one program of a department. They get every
// coordinator tool (batches, courses, faculty, Subject Experts, timetable...) for the people and data they own.
// The Chairman manages leads in any department; a Head of Department only in their own.

async function actor() {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT")) return null;
  return { user, chairmanId: user.role === "CHAIRMAN" ? user.id : user.managedById || "" };
}

// Creates a brand-new Program Coordinator who leads one program.
export async function POST(req: NextRequest) {
  const a = await actor();
  if (!a) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { user, chairmanId } = a;
  const body = await req.json().catch(() => ({}));
  const departmentId: string = user.role === "HEAD_OF_DEPARTMENT" ? user.departmentId || "" : body.departmentId;
  if (!body.username || !body.password || !body.name || !body.email || !departmentId || !body.program) {
    return NextResponse.json({ error: "name, email, username, password, department and program are required" }, { status: 400 });
  }
  const dept = await prisma.department.findFirst({ where: { id: departmentId, chairmanId } });
  if (!dept) return NextResponse.json({ error: "department not found" }, { status: 404 });
  const owns = await prisma.departmentProgram.findFirst({ where: { departmentId: dept.id, degreeProgram: body.program } });
  if (!owns) return NextResponse.json({ error: "that program does not belong to this department - tick it for the department first" }, { status: 400 });
  const existing = await prisma.user.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }] } });
  if (existing) return NextResponse.json({ error: "username or email already in use" }, { status: 409 });

  await prisma.user.updateMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: dept.id, leadProgram: body.program }, data: { leadProgram: null } });
  const created = await prisma.user.create({
    data: { email: body.email, username: body.username, passwordHash: await hashPassword(body.password), name: body.name, role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: dept.id, leadProgram: body.program, mustChangePassword: true },
  });
  await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_LEAD_CREATED", entityType: "User", entityId: created.id, metadata: { departmentId: dept.id, program: body.program } });
  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}

// Makes an existing coordinator of the department the lead of a program (userId + program), or clears a program's lead (program only).
export async function PATCH(req: NextRequest) {
  const a = await actor();
  if (!a) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { user, chairmanId } = a;
  const body = await req.json().catch(() => ({}));
  if (!body.program) return NextResponse.json({ error: "program is required" }, { status: 400 });

  const departmentId: string = user.role === "HEAD_OF_DEPARTMENT" ? user.departmentId || "none" : body.departmentId;
  const dept = await prisma.department.findFirst({ where: { id: departmentId, chairmanId } });
  if (!dept) return NextResponse.json({ error: "department not found" }, { status: 404 });
  const owns = await prisma.departmentProgram.findFirst({ where: { departmentId: dept.id, degreeProgram: body.program } });
  if (!owns) return NextResponse.json({ error: "that program does not belong to this department" }, { status: 400 });

  // One lead per program: whoever led it before no longer does.
  await prisma.user.updateMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: dept.id, leadProgram: body.program }, data: { leadProgram: null } });
  if (body.userId) {
    const coordinator = await prisma.user.findFirst({ where: { id: body.userId, role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: dept.id } });
    if (!coordinator) return NextResponse.json({ error: "choose one of this department's Program Coordinators" }, { status: 404 });
    await prisma.user.update({ where: { id: coordinator.id }, data: { leadProgram: body.program } });
  }
  await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_LEAD_SET", entityType: "Department", entityId: dept.id, metadata: { program: body.program, userId: body.userId || "none" } });
  return NextResponse.json({ ok: true });
}
