import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";

export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const grade: string | null = body.grade || null;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.batchId !== student.batchId) return NextResponse.json({ error: "invalid course" }, { status: 400 });
  if (course.semesterNumber === null) return NextResponse.json({ error: "That course has no semester assigned yet." }, { status: 400 });

  await prisma.degreePlanEntry.upsert({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
    update: { hypotheticalGrade: grade },
    create: { studentId: student.id, courseId: course.id, plannedSemesterNumber: course.semesterNumber, hypotheticalGrade: grade },
  });

  return NextResponse.json({ ok: true });
}
