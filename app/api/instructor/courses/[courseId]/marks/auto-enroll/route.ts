import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user || !course.batchId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const students = await prisma.student.findMany({ where: { batchId: course.batchId } });
  let enrolled = 0;
  for (const s of students) {
    const existing = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: s.id, courseId: course.id } } });
    if (!existing) {
      await prisma.studentEnrollment.create({ data: { studentId: s.id, courseId: course.id, isRepeat: false } });
      enrolled++;
    }
  }
  return NextResponse.json({ enrolled });
}
