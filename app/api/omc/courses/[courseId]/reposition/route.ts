import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { coordinator: true, prerequisiteCourse: true, postrequisiteCourses: true },
  });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (course.coordinator.managedById !== user.managedById) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (course.isOffered) {
    return NextResponse.json({ error: "this course is already offered this semester — repositioning is only for courses that haven't started yet" }, { status: 400 });
  }

  const body = await req.json();
  const newSemester = parseInt(body.semesterNumber, 10);
  if (isNaN(newSemester) || newSemester < 1 || newSemester > 8) {
    return NextResponse.json({ error: "semesterNumber must be between 1 and 8" }, { status: 400 });
  }

  // Can't move before your own prerequisite's semester.
  if (course.prerequisiteCourse?.semesterNumber && newSemester < course.prerequisiteCourse.semesterNumber) {
    return NextResponse.json({
      error: `can't move ${course.code} to Semester ${newSemester} — its prerequisite ${course.prerequisiteCourse.code} is in Semester ${course.prerequisiteCourse.semesterNumber}`,
    }, { status: 400 });
  }

  // Can't move behind any course that depends on this one either.
  const violatingDependents = course.postrequisiteCourses.filter((d) => d.semesterNumber !== null && d.semesterNumber < newSemester);
  if (violatingDependents.length > 0) {
    return NextResponse.json({
      error: `can't move ${course.code} to Semester ${newSemester} — ${violatingDependents.map((d) => `${d.code} (Sem ${d.semesterNumber})`).join(", ")} depend on it and come earlier`,
    }, { status: 400 });
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { semesterNumber: newSemester } });

  await writeAuditLog({ actorUserId: user.id, action: "COURSE_REPOSITIONED", entityType: "Course", entityId: course.id, metadata: { from: course.semesterNumber, to: newSemester } });

  return NextResponse.json({ course: updated });
}
