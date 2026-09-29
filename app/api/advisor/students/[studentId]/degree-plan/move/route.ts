import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

// Advisor-facing counterpart to /api/student/degree-plan/move — same
// "has this course historically run in that semester" validation, but
// performed by the Advisor for one specific advisee (e.g. building a
// retake plan for courses just dropped off a probation student's
// current semester), not by the student themselves.
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || !student.batch || student.batch.advisorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const targetSemesterNumber = parseInt(body.semesterNumber, 10);
  if (!courseId || !targetSemesterNumber || targetSemesterNumber < 1) {
    return NextResponse.json({ error: "courseId and a valid semesterNumber are required" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true } });
  if (!course || course.batchId !== student.batchId) return NextResponse.json({ error: "invalid course" }, { status: 400 });
  if (targetSemesterNumber < student.currentSemesterNumber) {
    return NextResponse.json({ error: "Can't plan a course into a semester the student has already passed." }, { status: 400 });
  }

  const everOfferedAtThatSemester = await prisma.course.findFirst({
    where: { code: course.code, semesterNumber: targetSemesterNumber, batch: { degreeProgram: course.batch?.degreeProgram } },
  });
  const validated = !!everOfferedAtThatSemester;

  await prisma.degreePlanEntry.upsert({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
    update: { plannedSemesterNumber: targetSemesterNumber },
    create: { studentId: student.id, courseId: course.id, plannedSemesterNumber: targetSemesterNumber },
  });

  await writeAuditLog({
    actorUserId: user.id, action: "ADVISOR_MOVED_DEGREE_PLAN_ENTRY", entityType: "Student", entityId: student.id,
    metadata: { courseId: course.id, code: course.code, targetSemesterNumber },
  });

  return NextResponse.json({
    ok: true, validated,
    warning: validated ? null : `${course.code} hasn't historically been offered in Semester ${targetSemesterNumber} for this program — double check with the Program Coordinator before relying on this plan.`,
  });
}
