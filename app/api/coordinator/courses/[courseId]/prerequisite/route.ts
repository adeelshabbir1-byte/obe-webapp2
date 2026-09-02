import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const prerequisiteCourseId = body.prerequisiteCourseId || null;
  if (prerequisiteCourseId === course.id) return NextResponse.json({ error: "a course cannot be its own prerequisite" }, { status: 400 });

  if (prerequisiteCourseId) {
    const prereq = await prisma.course.findUnique({ where: { id: prerequisiteCourseId } });
    if (!prereq || prereq.coordinatorId !== user.id) return NextResponse.json({ error: "invalid prerequisite course" }, { status: 400 });
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { prerequisiteCourseId } });
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_PREREQUISITE_SET", entityType: "Course", entityId: course.id, metadata: { prerequisiteCourseId } });
  return NextResponse.json({ course: updated });
}
