import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { hashPassword } from "../../../lib/auth";
import { writeAuditLog } from "../../../lib/audit";

// Creates a Program Lead: someone under a Head of Department who is responsible for one program.
// The Chairman can do this for any department; a Head of Department only for their own.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
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

  const created = await prisma.user.create({
    data: { email: body.email, username: body.username, passwordHash: await hashPassword(body.password), name: body.name, role: "PROGRAM_LEAD", managedById: chairmanId, departmentId: dept.id, leadProgram: body.program, mustChangePassword: true },
  });
  await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_LEAD_CREATED", entityType: "User", entityId: created.id, metadata: { departmentId: dept.id, program: body.program } });
  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}

// Changes which program a lead is responsible for (Chairman, or the lead's own Head of Department).
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const body = await req.json().catch(() => ({}));
  const lead = await prisma.user.findFirst({ where: { id: body.userId, role: "PROGRAM_LEAD", managedById: chairmanId, ...(user.role === "HEAD_OF_DEPARTMENT" ? { departmentId: user.departmentId || "none" } : {}) } });
  if (!lead || !lead.departmentId) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  const owns = await prisma.departmentProgram.findFirst({ where: { departmentId: lead.departmentId, degreeProgram: body.program } });
  if (!owns) return NextResponse.json({ error: "that program does not belong to this department" }, { status: 400 });
  await prisma.user.update({ where: { id: lead.id }, data: { leadProgram: body.program } });
  return NextResponse.json({ ok: true });
}
