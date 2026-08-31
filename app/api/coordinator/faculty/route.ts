import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const faculty = await prisma.user.findMany({
    where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] }, managedById: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ faculty: faculty.map(({ passwordHash, ...u }) => u) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.username || !body.password || !body.name || !body.email || !body.role) {
    return NextResponse.json({ error: "name, email, username, password, role are required" }, { status: 400 });
  }
  if (!["SUBJECT_EXPERT", "INSTRUCTOR"].includes(body.role)) {
    return NextResponse.json({ error: "role must be SUBJECT_EXPERT or INSTRUCTOR" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }] } });
  if (existing) {
    return NextResponse.json({ error: "username or email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password);
  const created = await prisma.user.create({
    data: {
      email: body.email,
      username: body.username,
      passwordHash,
      name: body.name,
      role: body.role,
      managedById: user.id,
      mustChangePassword: true,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_ONBOARDED", entityType: "User", entityId: created.id, metadata: { role: body.role } });

  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}
