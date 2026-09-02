import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const updated = await prisma.lectureRow.update({
    where: { id: params.lectureId },
    data: {
      topic: body.topic, subtopic: body.subtopic || null,
      cloId: body.cloId || null, bloomLevel: body.bloomLevel || null,
      actualDate: body.actualDate ? new Date(body.actualDate) : null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_LECTURE_UPDATED", entityType: "LectureRow", entityId: params.lectureId });
  return NextResponse.json({ row: updated });
}
