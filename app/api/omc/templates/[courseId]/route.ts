import { NextRequest, NextResponse } from "next/server";
import { notifyUsers } from "../../../../../lib/notifications";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course || course.coordinator.managedById !== user.managedById) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!body.status || !["approved", "changes-requested"].includes(body.status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'changes-requested'" }, { status: 400 });
  }

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: { templateStatus: body.status, omcComment: body.comment || null, templateReviewedById: user.id },
  });

  await writeAuditLog({
    actorUserId: user.id, action: body.status === "approved" ? "TEMPLATE_APPROVED" : "TEMPLATE_CHANGES_REQUESTED",
    entityType: "Course", entityId: course.id,
  });

  await notifyUsers([course.subjectExpertId], {
    kind: "TEMPLATE", title: body.status === "approved" ? `${course.code} plan approved by the OMC` : `${course.code} plan needs changes`,
    body: body.status === "approved" ? `${user.name} approved your plan of ${course.code} ${course.title}.` : `${user.name} asked for changes to ${course.code} ${course.title}${body.comment ? `: ${body.comment}` : "."}`,
    href: `/subjectexpert/courses/${course.id}/clos`,
  });
  return NextResponse.json({ course: updated });
}
