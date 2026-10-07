import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";

// Creates a Head of Department account. A department can have more than one head.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.username || !body.password || !body.name || !body.email || !body.departmentId) {
    return NextResponse.json({ error: "name, email, username, password and departmentId are required" }, { status: 400 });
  }
  const dept = await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId: user.id } });
  if (!dept) return NextResponse.json({ error: "department not found" }, { status: 404 });
  const existing = await prisma.user.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }] } });
  if (existing) return NextResponse.json({ error: "username or email already in use" }, { status: 409 });

  const passwordHash = await hashPassword(body.password);
  const created = await prisma.user.create({
    data: { email: body.email, username: body.username, passwordHash, name: body.name, role: "HEAD_OF_DEPARTMENT", managedById: user.id, departmentId: dept.id, mustChangePassword: true, secondaryRole: body.alsoFaculty ? "INSTRUCTOR" : null },
  });
  await writeAuditLog({ actorUserId: user.id, action: "HEAD_OF_DEPARTMENT_CREATED", entityType: "User", entityId: created.id, metadata: { departmentId: dept.id } });
  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}

// Turns "this head also teaches as faculty" on or off.
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const head = await prisma.user.findFirst({ where: { id: body.userId, role: "HEAD_OF_DEPARTMENT", managedById: user.id } });
  if (!head) return NextResponse.json({ error: "head not found" }, { status: 404 });
  await prisma.user.update({ where: { id: head.id }, data: { secondaryRole: body.alsoFaculty ? "INSTRUCTOR" : null } });
  await writeAuditLog({ actorUserId: user.id, action: "HEAD_FACULTY_TOGGLED", entityType: "User", entityId: head.id, metadata: { alsoFaculty: !!body.alsoFaculty } });
  return NextResponse.json({ ok: true });
}
