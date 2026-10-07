import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";

// Creates a Dean account for a faculty. A faculty can have more than one Dean (e.g. an acting one).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.username || !body.password || !body.name || !body.email || !body.facultyId) {
    return NextResponse.json({ error: "name, email, username, password and facultyId are required" }, { status: 400 });
  }
  const faculty = await prisma.faculty.findFirst({ where: { id: body.facultyId, chairmanId: user.id } });
  if (!faculty) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
  const existing = await prisma.user.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }] } });
  if (existing) return NextResponse.json({ error: "username or email already in use" }, { status: 409 });
  const created = await prisma.user.create({
    data: { email: body.email, username: body.username, passwordHash: await hashPassword(body.password), name: body.name, role: "DEAN", managedById: user.id, facultyId: faculty.id, mustChangePassword: true },
  });
  await writeAuditLog({ actorUserId: user.id, action: "DEAN_CREATED", entityType: "User", entityId: created.id, metadata: { facultyId: faculty.id } });
  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}
