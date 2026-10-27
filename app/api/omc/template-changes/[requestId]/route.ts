import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { snapshotTemplate } from "../../../../../lib/templateDiff";
import { voteOnRequest } from "../../../../../lib/omcRules";
import { notifyUsers } from "../../../../../lib/notifications";

// A request to change an approved plan (or its topics) is decided by OMC votes: two approvals reopen the plan for the
// Subject Expert at once; two rejections with reasons decline it. A course with a semester panel: only the panel votes (2 of 3).
export async function PATCH(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const request = await prisma.templateChangeRequest.findUnique({ where: { id: params.requestId } });
  if (!request || request.status !== "pending") return NextResponse.json({ error: "not found" }, { status: 404 });
  const course = await prisma.course.findUnique({ where: { id: request.courseId }, include: { coordinator: true } });
  if (!course || course.coordinator.managedById !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!["approved", "rejected"].includes(body.status)) return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  const comment = String(body.comment || "").trim() || null;

  let votes;
  try { votes = await voteOnRequest({ id: user.realUserId || user.id, name: user.name }, "TEMPLATE", request.id, course.id, body.status === "approved", comment || ""); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  await writeAuditLog({ actorUserId: user.id, action: body.status === "approved" ? "TEMPLATE_CHANGE_VOTE_APPROVE" : "TEMPLATE_CHANGE_VOTE_REJECT", entityType: "Course", entityId: course.id, metadata: { requestId: request.id, line: votes.line } });
  if (!votes.decided) {
    await notifyUsers([request.requestedById], { kind: "TEMPLATE", title: `${course.code} plan change request: ${votes.line}`, body: `${user.name} voted ${body.status === "approved" ? "to approve" : "to reject"}.`, href: `/subjectexpert/courses/${course.id}/clos` });
    return NextResponse.json({ ok: true, votes: votes.line, decided: false });
  }
  const reasons = votes.votes.filter((v) => v.approve === (votes.decided === "approved") && v.reason).map((v) => `${v.name}: ${v.reason}`).join(" · ");
  const note = `${votes.line}${reasons ? ` — ${reasons}` : ""}`.slice(0, 4000);
  if (votes.decided === "approved") {
    const before = await snapshotTemplate(course.id);
    await prisma.templateChangeRequest.update({
      where: { id: request.id },
      data: { status: "approved", omcComment: note, reviewedById: user.id, reviewedAt: new Date(), beforeJson: JSON.stringify(before) },
    });
    await prisma.course.update({ where: { id: course.id }, data: { templateStatus: "reopened" } });
    // Topic Workspace changes accepted on this approved plan apply now.
    await import("../../../../../lib/topicPlan").then((m) => m.applyAfterTemplateApproval(request.id, { id: user.id, role: user.role, managedById: user.managedById, name: user.name })).catch(() => 0);
  } else {
    await prisma.templateChangeRequest.update({
      where: { id: request.id },
      data: { status: "rejected", omcComment: note, reviewedById: user.id, reviewedAt: new Date() },
    });
  }
  await writeAuditLog({ actorUserId: user.id, action: votes.decided === "approved" ? "TEMPLATE_CHANGE_APPROVED" : "TEMPLATE_CHANGE_REJECTED", entityType: "Course", entityId: course.id, metadata: { line: votes.line } });
  await notifyUsers([request.requestedById], { kind: "TEMPLATE", title: `${course.code} plan change ${votes.decided}`, body: note, href: `/subjectexpert/courses/${course.id}/clos` });
  return NextResponse.json({ ok: true, votes: votes.line, decided: votes.decided });
}
