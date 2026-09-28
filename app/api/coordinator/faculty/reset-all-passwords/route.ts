import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { hashPassword } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";

// Bulk password reset for every faculty member (Subject Expert or
// Instructor) this Coordinator onboarded — unlike a student's initial
// password, which defaults to their own roll number, faculty are onboarded
// with a Coordinator-typed password and there's no single-click way to
// reset a whole list at once. This sets ALL of them to the same fixed
// temporary password, and forces each to set their own real one on next
// login — for when a whole batch of faculty accounts is locked out or
// nobody remembers what was typed in at onboarding time.
const DEFAULT_PASSWORD = "12345678";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const faculty = await prisma.user.findMany({ where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] }, managedById: user.id } });
  if (faculty.length === 0) return NextResponse.json({ reset: 0 });

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  await prisma.user.updateMany({
    where: { id: { in: faculty.map((f) => f.id) } },
    data: { passwordHash, mustChangePassword: true },
  });

  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_PASSWORDS_BULK_RESET", metadata: { count: faculty.length } });

  return NextResponse.json({ reset: faculty.length });
}
