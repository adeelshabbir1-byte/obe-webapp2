import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Drops a student's current-semester enrollment directly — unlike the
// student's own self-service withdraw (electives only, and gated behind
// an approval request when their standing requires it), the Advisor IS
// that approval, so this acts immediately and isn't limited to
// electives. Meant for exactly the probation case: the advisor decides
// the student needs to drop a course (core or elective) this semester
// and will retake it later — drop it here, then use degree-plan/move to
// schedule it into a future semester.
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || !student.batch || student.batch.advisorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const enrollment = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId } } });
  if (!enrollment) return NextResponse.json({ error: "student isn't enrolled in that course" }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: courseId } });

  await prisma.studentMark.deleteMany({ where: { studentId: student.id, courseId } });
  await prisma.studentEnrollment.delete({ where: { id: enrollment.id } });

  await writeAuditLog({
    actorUserId: user.id, action: "ADVISOR_DROPPED_ENROLLMENT", entityType: "Student", entityId: student.id,
    metadata: { courseId, code: course?.code },
  });

  return NextResponse.json({ ok: true });
}
