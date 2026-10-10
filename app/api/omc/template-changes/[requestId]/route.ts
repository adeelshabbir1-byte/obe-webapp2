import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { snapshotTemplate } from "../../../../../lib/templateDiff";

// The OMC agrees (the template reopens for the SE) or declines a request to change an approved template.
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

  if (body.status === "approved") {
    const before = await snapshotTemplate(course.id);
    await prisma.templateChangeRequest.update({
      where: { id: request.id },
      data: { status: "approved", omcComment: comment, reviewedById: user.id, reviewedAt: new Date(), beforeJson: JSON.stringify(before) },
    });
    await prisma.course.update({ where: { id: course.id }, data: { templateStatus: "reopened" } });
  } else {
    await prisma.templateChangeRequest.update({
      where: { id: request.id },
      data: { status: "rejected", omcComment: comment, reviewedById: user.id, reviewedAt: new Date() },
    });
  }
  await writeAuditLog({ actorUserId: user.id, action: body.status === "approved" ? "TEMPLATE_CHANGE_APPROVED" : "TEMPLATE_CHANGE_REJECTED", entityType: "Course", entityId: course.id });
  return NextResponse.json({ ok: true });
}
