import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const request = await prisma.weightExceptionRequest.findUnique({
    where: { id: params.requestId },
    include: { course: { include: { coordinator: true } } },
  });
  if (!request || request.course.coordinator.managedById !== user.managedById) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!body.status || !["approved", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  if (body.status === "approved") {
    if (request.source === "INSTRUCTOR") {
      await prisma.course.update({
        where: { id: request.courseId },
        data: {
          instructorAssignmentPct: request.assignmentPct, instructorQuizPct: request.quizPct, instructorProjectPct: request.projectPct,
          instructorLabPct: request.labPct, instructorMidtermPct: request.midtermPct, instructorFinalPct: request.finalPct,
        },
      });
    } else {
      await prisma.course.update({
        where: { id: request.courseId },
        data: {
          assignmentPct: request.assignmentPct, quizPct: request.quizPct, projectPct: request.projectPct,
          labPct: request.labPct, midtermPct: request.midtermPct, finalPct: request.finalPct,
        },
      });
    }
  }

  const updated = await prisma.weightExceptionRequest.update({
    where: { id: params.requestId },
    data: { status: body.status, omcComment: body.comment || null, reviewedById: user.id, reviewedAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: user.id, action: body.status === "approved" ? "WEIGHT_EXCEPTION_APPROVED" : "WEIGHT_EXCEPTION_REJECTED",
    entityType: "Course", entityId: request.courseId,
  });

  return NextResponse.json({ request: updated });
}
