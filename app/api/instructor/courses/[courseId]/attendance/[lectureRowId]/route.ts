import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";

export async function GET(req: NextRequest, { params }: { params: { courseId: string; lectureRowId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const lectureRow = await prisma.lectureRow.findUnique({ where: { id: params.lectureRowId } });
  if (!lectureRow || lectureRow.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [enrollments, records] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId: course.id }, include: { student: true } }),
    prisma.attendanceRecord.findMany({ where: { lectureRowId: params.lectureRowId } }),
  ]);
  const statusByStudent = new Map(records.map((r) => [r.studentId, r.status]));

  return NextResponse.json({
    students: enrollments.map((e) => ({ id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber, status: statusByStudent.get(e.student.id) || null })),
  });
}

export async function PUT(req: NextRequest, { params }: { params: { courseId: string; lectureRowId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const lectureRow = await prisma.lectureRow.findUnique({ where: { id: params.lectureRowId } });
  if (!lectureRow || lectureRow.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const entries: { studentId: string; status: string }[] = body.entries || [];
  const validStatuses = ["PRESENT", "ABSENT", "LEAVE"];

  for (const e of entries) {
    if (!validStatuses.includes(e.status)) continue;
    await prisma.attendanceRecord.upsert({
      where: { lectureRowId_studentId: { lectureRowId: params.lectureRowId, studentId: e.studentId } },
      create: { courseId: course.id, lectureRowId: params.lectureRowId, studentId: e.studentId, status: e.status, markedById: user.id },
      update: { status: e.status, markedById: user.id },
    });
  }

  return NextResponse.json({ ok: true });
}
