import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const cloCount = await prisma.cLO.count({ where: { courseId: course.id } });
  const lectureCount = await prisma.lectureRow.count({ where: { courseId: course.id } });
  if (cloCount === 0 || lectureCount === 0) {
    return NextResponse.json({ error: "add at least one CLO and one lecture row before submitting" }, { status: 400 });
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { templateStatus: "submitted" } });
  await writeAuditLog({ actorUserId: user.id, action: "TEMPLATE_SUBMITTED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated });
}
