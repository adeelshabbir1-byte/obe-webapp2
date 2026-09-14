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
  const instructorId = body.instructorId || null;

  if (instructorId && !course.isOffered) {
    return NextResponse.json({ error: "this course must be offered before an instructor can be assigned to it" }, { status: 400 });
  }

  if (instructorId) {
    const instructor = await prisma.user.findUnique({ where: { id: instructorId } });
    const isValidInstructor = instructor && instructor.managedById === user.id && (instructor.role === "INSTRUCTOR" || instructor.role === "SUBJECT_EXPERT");
    if (!isValidInstructor) {
      return NextResponse.json({ error: "invalid instructor" }, { status: 400 });
    }
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { instructorId } });

  await writeAuditLog({
    actorUserId: user.id, action: "INSTRUCTOR_ASSIGNED", entityType: "Course", entityId: course.id,
    metadata: { instructorId: instructorId || "none" },
  });

  return NextResponse.json({ course: updated });
}
