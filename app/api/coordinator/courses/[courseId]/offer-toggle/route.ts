import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { autoEnrollBatchStudents } from "../../../../../../lib/autoEnroll";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const isOffered = !!body.isOffered;

  const data: any = { isOffered };
  if (isOffered) {
    const current = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } });
    if (current) { data.offeredTermName = current.termName; data.offeredTermYear = current.year; }
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data });
  if (isOffered) await autoEnrollBatchStudents(course.id, course.batchId);

  await writeAuditLog({ actorUserId: user.id, action: isOffered ? "COURSE_OFFERED_MANUALLY" : "COURSE_UNOFFERED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated });
}
