import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { hashPassword } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";

// Resets ONE student's login back to their roll number, without
// touching anyone else in the batch — unlike the batch-wide "force"
// activation (which resets every already-activated student at once),
// this is for the ordinary "this one student forgot their password"
// case a Coordinator hits one-on-one, and shouldn't have to nuke
// everyone else's chosen password just to fix it.
export async function POST(req: Request, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || !student.batch || student.batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const hash = await hashPassword(student.rollNumber);
  await prisma.student.update({ where: { id: student.id }, data: { passwordHash: hash, mustChangePassword: true } });

  await writeAuditLog({ actorUserId: user.id, action: "STUDENT_PASSWORD_RESET", entityType: "Student", entityId: student.id, metadata: { rollNumber: student.rollNumber } });

  return NextResponse.json({ ok: true, rollNumber: student.rollNumber });
}
