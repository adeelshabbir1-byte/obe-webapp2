import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const request = await prisma.registrationApprovalRequest.findUnique({ where: { id: params.requestId }, include: { student: { include: { batch: true } } } });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.student.batch.advisorId !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (request.status !== "PENDING") return NextResponse.json({ error: `already ${request.status.toLowerCase()}` }, { status: 400 });

  await prisma.registrationApprovalRequest.update({ where: { id: request.id }, data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: body.note || null } });
  await writeAuditLog({ actorUserId: user.id, action: "REGISTRATION_APPROVAL_REJECTED", entityType: "Course", entityId: request.courseId, metadata: { studentId: request.studentId, note: body.note || "" } });

  return NextResponse.json({ ok: true });
}
