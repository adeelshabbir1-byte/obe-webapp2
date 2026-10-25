import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { ensureAllInstrumentCounts } from "../../../../../lib/instrumentAutoFill";

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

  { // Two OMC approvals approve, two rejections reject (or 2 of the course's 3-member panel).
    const v = await (await import("../../../../../lib/omcRules")).requestVote({ kind: "WEIGHT_EXCEPTION", requestId: request.id, courseId: request.courseId, user: { id: user.id, name: user.name }, approve: body.status === "approved", reason: body.comment });
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    if (!v.decided) return NextResponse.json({ pending: true, message: v.message });
    body.status = v.decided; body.comment = [body.comment, v.message].filter(Boolean).join(" — ");
  }
  if (body.status === "approved") {
    if (request.source === "INSTRUCTOR") {
      await prisma.course.update({
        where: { id: request.courseId },
        data: {
          instructorAssignmentPct: request.assignmentPct, instructorQuizPct: request.quizPct, instructorProjectPct: request.projectPct,
          instructorLabPct: request.labPct, instructorMidtermPct: request.midtermPct, instructorFinalPct: request.finalPct,
          instructorWeightsConfirmedAt: new Date(),
        },
      });
    } else {
      const updatedCourse = await prisma.course.update({
        where: { id: request.courseId },
        data: {
          assignmentPct: request.assignmentPct, quizPct: request.quizPct, projectPct: request.projectPct,
          labPct: request.labPct, midtermPct: request.midtermPct, finalPct: request.finalPct,
          weightsConfirmedAt: new Date(),
        },
      });
      // Same as a normal in-policy weights save — now that the % split is
      // final, top up instruments to the SE's saved item counts.
      await ensureAllInstrumentCounts(request.courseId, "SE", updatedCourse);
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
