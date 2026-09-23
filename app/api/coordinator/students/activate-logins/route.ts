import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { hashPassword } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";

// Bootstraps a student's login password to their own roll number
// (mustChangePassword forces them to pick their own on first login) —
// the same "known identifier as initial password" pattern commonly
// used to hand out portal access at scale, since students have no
// email on file to send a real invite/reset link to.
//
// Only activates students who don't already have a password set,
// unless force=true is passed — never silently resets someone who's
// already logged in and chosen their own password.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const students = await prisma.student.findMany({
    where: { batchId: batch.id, ...(body.force ? {} : { passwordHash: null }) },
  });

  let activated = 0;
  for (const s of students) {
    const hash = await hashPassword(s.rollNumber);
    await prisma.student.update({ where: { id: s.id }, data: { passwordHash: hash, mustChangePassword: true } });
    activated++;
  }

  await writeAuditLog({ actorUserId: user.id, action: "STUDENT_LOGINS_ACTIVATED", entityType: "Batch", entityId: batch.id, metadata: { activated, force: !!body.force } });

  return NextResponse.json({ activated });
}
