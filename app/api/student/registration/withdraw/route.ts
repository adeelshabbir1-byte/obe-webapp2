import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";
import { needsAdvisorApproval } from "../../../../../lib/academicStanding";

export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId } });
  if (!batch || !batch.registrationOpen) return NextResponse.json({ error: "The add/drop window isn't open for your batch right now." }, { status: 400 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const enrollment = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId } } });
  if (!enrollment) return NextResponse.json({ error: "You're not enrolled in that course." }, { status: 400 });

  // Only ever withdraws from an elective the student chose themselves —
  // a core/default course assigned by the Coordinator's batch-wide
  // enrollment run can't be dropped this way, by design.
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.courseType !== "Elective") {
    return NextResponse.json({ error: "Only elective courses you registered for yourself can be withdrawn here — contact your Program Coordinator for anything else." }, { status: 400 });
  }

  // A withdrawal is always from the student's own current-semester
  // enrollment, so this can only ever come back ACADEMIC_STANDING (never
  // MODIFIED_PLAN) — but reusing the same check keeps the rule in one
  // place rather than duplicating the standing logic here.
  const reasonCode = await needsAdvisorApproval(student.id, course);
  if (reasonCode) {
    const alreadyPending = await prisma.registrationApprovalRequest.findFirst({
      where: { studentId: student.id, courseId: course.id, actionType: "WITHDRAW", status: "PENDING" },
    });
    if (alreadyPending) return NextResponse.json({ error: "You already have a pending withdrawal request for this course." }, { status: 400 });

    await prisma.registrationApprovalRequest.create({
      data: { studentId: student.id, courseId: course.id, actionType: "WITHDRAW", reasonCode },
    });
    return NextResponse.json({
      ok: true, pendingApproval: true,
      message: "Your academic standing requires Advisor approval for any registration change — this withdrawal has been sent to your Advisor.",
    });
  }

  // Withdrawing removes any marks already recorded too, since the
  // student is no longer taking the course at all.
  await prisma.studentMark.deleteMany({ where: { studentId: student.id, courseId } });
  await prisma.studentEnrollment.delete({ where: { id: enrollment.id } });

  return NextResponse.json({ ok: true, pendingApproval: false });
}
