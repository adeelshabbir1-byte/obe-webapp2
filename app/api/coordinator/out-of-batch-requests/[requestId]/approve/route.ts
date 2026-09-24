import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const request = await prisma.outOfBatchRequest.findUnique({ where: { id: params.requestId }, include: { course: true } });
  if (!request || request.course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: `already ${request.status.toLowerCase()}` }, { status: 400 });

  const existingEnrollment = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: request.studentId, courseId: request.courseId } } });
  if (!existingEnrollment) {
    await prisma.studentEnrollment.create({ data: { studentId: request.studentId, courseId: request.courseId, isRepeat: false } });
  }

  await prisma.outOfBatchRequest.update({ where: { id: request.id }, data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "OUT_OF_BATCH_REQUEST_APPROVED", entityType: "Course", entityId: request.courseId, metadata: { studentId: request.studentId } });

  return NextResponse.json({ ok: true });
}
