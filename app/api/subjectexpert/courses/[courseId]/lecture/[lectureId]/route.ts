import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  // Week and Lecture # are intentionally NOT editable here — they're fixed
  // by the 32-row template (2 lectures per week). Weight is also not set
  // here — it's auto-computed from linked assessment instruments.
  const updated = await prisma.lectureRow.update({
    where: { id: params.lectureId },
    data: {
      topic: body.topic, subtopic: body.subtopic || null,
      cloId: body.cloId || null, bloomLevel: body.bloomLevel || null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_UPDATED", entityType: "LectureRow", entityId: params.lectureId });

  return NextResponse.json({ row: updated });
}

export async function DELETE(req: Request, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.lectureRow.delete({ where: { id: params.lectureId } });
  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_DELETED", entityType: "LectureRow", entityId: params.lectureId });

  return NextResponse.json({ ok: true });
}
