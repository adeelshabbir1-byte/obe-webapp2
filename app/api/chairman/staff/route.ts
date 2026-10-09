import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";

const ROLES = ["LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS"];

// The Institute Head creates a Librarian or a Finance Officer login.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!ROLES.includes(b.role) || !b.name || !b.email || !b.username || !b.password) return NextResponse.json({ error: "Choose the role and give a name, email, username and password" }, { status: 400 });
  if (String(b.password).length < 8) return NextResponse.json({ error: "The password needs at least 8 characters" }, { status: 400 });
  const existing = await prisma.user.findFirst({ where: { OR: [{ username: b.username }, { email: b.email }] } });
  if (existing) return NextResponse.json({ error: "That username or email is already in use" }, { status: 409 });
  try {
    const created = await prisma.user.create({ data: { email: b.email, username: b.username, passwordHash: await hashPassword(b.password), name: b.name, role: b.role, managedById: user.id, mustChangePassword: true } as never });
    await writeAuditLog({ actorUserId: user.id, action: "STAFF_CREATED", entityType: "User", entityId: created.id, metadata: { role: b.role } as never });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Could not create the login: " + String((err as Error)?.message || err).split("\n").slice(-3).join(" ").slice(0, 300) }, { status: 500 });
  }
}
