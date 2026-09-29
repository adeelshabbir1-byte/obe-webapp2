import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";

// Advisor-facing counterpart to /api/student/degree-plan/hypothetical-grade
// — lets the Advisor try out a future grade for a course in the
// student's plan (e.g. "if they get a B+ retaking this course next
// semester") and see the effect on projected GPA/CGPA, same as the
// student's own what-if planner.
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || !student.batch || student.batch.advisorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

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
