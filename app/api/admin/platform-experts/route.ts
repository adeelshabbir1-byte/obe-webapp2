import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";

// Platform Subject Experts: attached to no institute, they design Master Curriculum courses for everyone.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const experts = await prisma.user.findMany({ where: { role: "SUBJECT_EXPERT", isPlatformExpert: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ experts: experts.map(({ passwordHash, ...u }) => u) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.username || !body.password || !body.name || !body.email) return NextResponse.json({ error: "name, email, username and password are required" }, { status: 400 });
  const existing = await prisma.user.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }] } });
  if (existing) return NextResponse.json({ error: "username or email already in use" }, { status: 409 });

  const created = await prisma.user.create({
    data: {
      email: body.email, username: body.username, passwordHash: await hashPassword(body.password), name: body.name,
      role: "SUBJECT_EXPERT", isPlatformExpert: true, managedById: user.id, mustChangePassword: true,
      organization: typeof body.organization === "string" && body.organization.trim() ? body.organization.trim().slice(0, 120) : null,
      specialization: typeof body.specialization === "string" && body.specialization.trim() ? body.specialization.trim() : null,
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "PLATFORM_EXPERT_CREATED", entityType: "User", entityId: created.id });
  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}
