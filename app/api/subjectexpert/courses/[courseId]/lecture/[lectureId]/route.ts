import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.lectureRow.delete({ where: { id: params.lectureId } });
  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_DELETED", entityType: "LectureRow", entityId: params.lectureId });

  return NextResponse.json({ ok: true });
}
