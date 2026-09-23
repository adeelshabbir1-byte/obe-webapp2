import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { hashPassword, verifyPassword } from "../../../../lib/auth";

export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  if (!body.newPassword || body.newPassword.length < 8) {
    return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
  }

  const full = await prisma.student.findUnique({ where: { id: student.id } });
  if (!full) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Same rule as staff: a forced first-login change skips the current-
  // password check (there isn't a meaningful one to check yet, since it
  // was bootstrapped by a Coordinator); any later change requires it.
  if (!full.mustChangePassword) {
    if (!body.currentPassword || !full.passwordHash || !(await verifyPassword(full.passwordHash, body.currentPassword))) {
      return NextResponse.json({ error: "current password is incorrect" }, { status: 400 });
    }
  }

  const newHash = await hashPassword(body.newPassword);
  await prisma.student.update({ where: { id: student.id }, data: { passwordHash: newHash, mustChangePassword: false } });

  return NextResponse.json({ ok: true });
}
