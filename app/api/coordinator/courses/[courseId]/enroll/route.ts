import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const student = await prisma.student.findUnique({ where: { id: body.studentId }, include: { batch: true } });
  if (!student || student.batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid student" }, { status: 400 });

  const isRepeat = student.batchId !== course.batchId; // repeating if enrolling into a course outside their home batch

  const enrollment = await prisma.studentEnrollment.upsert({
    where: { studentId_courseId: { studentId: body.studentId, courseId: course.id } },
    create: { studentId: body.studentId, courseId: course.id, isRepeat },
    update: {},
  });

  await writeAuditLog({ actorUserId: user.id, action: "STUDENT_ENROLLED", entityType: "Course", entityId: course.id, metadata: { studentId: body.studentId, isRepeat } });

  return NextResponse.json({ enrollment }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  await prisma.studentMark.deleteMany({ where: { studentId: body.studentId, courseId: course.id } });
  await prisma.studentEnrollment.deleteMany({ where: { studentId: body.studentId, courseId: course.id } });

  return NextResponse.json({ ok: true });
}
