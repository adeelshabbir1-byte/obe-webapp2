import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";

export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId } });
  if (!batch || !batch.registrationOpen) return NextResponse.json({ error: "Registration isn't open for your batch right now." }, { status: 400 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.batchId !== batch.id || !course.isOffered || course.courseType !== "Elective") {
    return NextResponse.json({ error: "That course isn't available for self-registration." }, { status: 400 });
  }

  const existing = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId: course.id } } });
  if (existing) return NextResponse.json({ error: "You're already registered for this course." }, { status: 400 });

  await prisma.studentEnrollment.create({ data: { studentId: student.id, courseId: course.id, isRepeat: false } });
  return NextResponse.json({ ok: true });
}
