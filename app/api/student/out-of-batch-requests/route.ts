import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";

export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true } });
  if (!course || !course.isOffered) return NextResponse.json({ error: "invalid course" }, { status: 400 });
  if (course.batchId === student.batchId) return NextResponse.json({ error: "That course is already in your own batch — register for it directly instead." }, { status: 400 });

  const existing = await prisma.outOfBatchRequest.findFirst({ where: { studentId: student.id, courseId: course.id, status: "PENDING" } });
  if (existing) return NextResponse.json({ error: "You already have a pending request for this course." }, { status: 400 });

  const request = await prisma.outOfBatchRequest.create({
    data: { studentId: student.id, courseId: course.id, reason: body.reason || null },
  });

  return NextResponse.json({ ok: true, requestId: request.id }, { status: 201 });
}
