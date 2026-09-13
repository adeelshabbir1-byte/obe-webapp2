import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { deleteCourseCompletely } from "../../../../../lib/deleteCourseCompletely";
import { writeAuditLog } from "../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { batch: true } });
  if (!course || !course.batch || course.batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await deleteCourseCompletely(params.courseId);
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_DELETED", entityType: "Course", entityId: params.courseId });

  return NextResponse.json({ ok: true });
}
