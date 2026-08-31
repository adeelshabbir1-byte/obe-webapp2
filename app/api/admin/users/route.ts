import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const chairmen = await prisma.user.findMany({ where: { role: "CHAIRMAN" }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ chairmen: chairmen.map(({ passwordHash, ...u }) => u) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.username || !body.password || !body.name || !body.email) {
    return NextResponse.json({ error: "name, email, username, password are required" }, { status: 400 });
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
      role: "CHAIRMAN",
      department: body.department || null,
      managedById: user.id,
      mustChangePassword: true,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "CHAIRMAN_CREATED", entityType: "User", entityId: created.id });

  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}
