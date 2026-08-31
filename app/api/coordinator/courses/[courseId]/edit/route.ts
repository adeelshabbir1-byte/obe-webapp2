import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.code || !body.title || !body.creditHours) {
    return NextResponse.json({ error: "code, title, creditHours are required" }, { status: 400 });
  }

  if (body.code !== course.code) {
    const clash = await prisma.course.findFirst({ where: { coordinatorId: user.id, batchId: course.batchId, code: body.code, NOT: { id: course.id } } });
    if (clash) return NextResponse.json({ error: "another course in this batch already uses this code" }, { status: 409 });
  }

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      code: body.code, title: body.title, creditHours: parseInt(body.creditHours, 10),
      courseType: body.courseType || course.courseType,
      semesterNumber: body.semesterNumber ? parseInt(body.semesterNumber, 10) : null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "COURSE_EDITED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated });
}
