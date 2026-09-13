import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { renumberPaperDistribution } from "../../../../../../../lib/paperDistributionOrdering";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string; itemId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const item = await prisma.paperDistributionItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.courseId !== course.id || item.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.paperDistributionItem.update({
    where: { id: params.itemId },
    data: {
      topicText: body.topicText ?? item.topicText,
      lectureRowId: body.lectureRowId !== undefined ? (body.lectureRowId || null) : item.lectureRowId,
      cloId: body.cloId !== undefined ? (body.cloId || null) : item.cloId,
      cognitiveLevel: body.cognitiveLevel !== undefined ? (body.cognitiveLevel || null) : item.cognitiveLevel,
      marks: body.marks !== undefined ? parseFloat(body.marks) : item.marks,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "PAPER_DISTRIBUTION_ITEM_UPDATED", entityType: "PaperDistributionItem", entityId: params.itemId });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: { courseId: string; itemId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const item = await prisma.paperDistributionItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.courseId !== course.id || item.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.paperDistributionItem.delete({ where: { id: params.itemId } });
  await renumberPaperDistribution(course.id, "INSTRUCTOR");
  await writeAuditLog({ actorUserId: user.id, action: "PAPER_DISTRIBUTION_ITEM_DELETED", entityType: "PaperDistributionItem", entityId: params.itemId });

  return NextResponse.json({ ok: true });
}
