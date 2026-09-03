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
  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      midtermDate: body.midtermDate ? new Date(body.midtermDate) : null,
      finalDate: body.finalDate ? new Date(body.finalDate) : null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "EXAM_DATES_SET", entityType: "Course", entityId: course.id });
  return NextResponse.json({ course: updated });
}
