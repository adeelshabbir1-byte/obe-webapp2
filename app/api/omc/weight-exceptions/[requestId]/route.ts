import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { ensureAllInstrumentCounts } from "../../../../../lib/instrumentAutoFill";
import { voteOnRequest } from "../../../../../lib/omcRules";
import { notifyUsers } from "../../../../../lib/notifications";
import { withErrors } from "../../../../../lib/apiHandler";

// A weight exception is decided by OMC votes: two approvals approve it at once, two rejections (with reasons) reject it.
// When the Convener has given the course a panel for the semester, only the panel's three members vote (2 of 3).
async function PATCH_handler(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const request = await prisma.weightExceptionRequest.findUnique({
    where: { id: params.requestId },
    include: { course: { include: { coordinator: true } } },
  });
  if (!request || request.course.coordinator.managedById !== user.managedById) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (request.status !== "pending") return NextResponse.json({ error: "This request is already decided." }, { status: 409 });

  const body = await req.json();
  if (!body.status || !["approved", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }
  let votes;
  try { votes = await voteOnRequest({ id: user.realUserId || user.id, name: user.name }, "WEIGHT", request.id, request.courseId, body.status === "approved", String(body.comment || "")); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  await writeAuditLog({ actorUserId: user.id, action: body.status === "approved" ? "WEIGHT_EXCEPTION_VOTE_APPROVE" : "WEIGHT_EXCEPTION_VOTE_REJECT", entityType: "Course", entityId: request.courseId, metadata: { requestId: request.id, line: votes.line } });
  if (!votes.decided) {
    await notifyUsers([request.requestedById], { kind: "TEMPLATE", title: `${request.course.code} weight exception: ${votes.line}`, body: `${user.name} voted ${body.status === "approved" ? "to approve" : "to reject"}.`, href: "/dashboard" });
    return NextResponse.json({ request, votes: votes.line, decided: false });
  }

  if (votes.decided === "approved") {
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

  const reasons = votes.votes.filter((v) => v.approve === (votes.decided === "approved") && v.reason).map((v) => `${v.name}: ${v.reason}`).join(" · ");
  const updated = await prisma.weightExceptionRequest.update({
    where: { id: params.requestId },
    data: { status: votes.decided, omcComment: `${votes.line}${reasons ? ` — ${reasons}` : ""}`.slice(0, 4000), reviewedById: user.id, reviewedAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: user.id, action: votes.decided === "approved" ? "WEIGHT_EXCEPTION_APPROVED" : "WEIGHT_EXCEPTION_REJECTED",
    entityType: "Course", entityId: request.courseId, metadata: { line: votes.line },
  });
  await notifyUsers([request.requestedById], { kind: "TEMPLATE", title: `${request.course.code} weight exception ${votes.decided}`, body: `${votes.line}${reasons ? ` — ${reasons}` : ""}`, href: "/dashboard" });

  return NextResponse.json({ request: updated, votes: votes.line, decided: votes.decided });
}
export const PATCH = withErrors(PATCH_handler);
