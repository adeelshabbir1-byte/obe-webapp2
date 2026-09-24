import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";
import { needsAdvisorApproval } from "../../../../../lib/academicStanding";

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

  // Gated instead of applied immediately if the student's academic
  // standing or this being an off-track course requires an Advisor's
  // sign-off first — see lib/academicStanding.ts for exactly when.
  const reasonCode = await needsAdvisorApproval(student.id, course);
  if (reasonCode) {
    const alreadyPending = await prisma.registrationApprovalRequest.findFirst({
      where: { studentId: student.id, courseId: course.id, actionType: "REGISTER", status: "PENDING" },
    });
    if (alreadyPending) return NextResponse.json({ error: "You already have a pending approval request for this course." }, { status: 400 });

    await prisma.registrationApprovalRequest.create({
      data: { studentId: student.id, courseId: course.id, actionType: "REGISTER", reasonCode },
    });
    return NextResponse.json({
      ok: true, pendingApproval: true,
      message: reasonCode === "ACADEMIC_STANDING"
        ? "Your academic standing requires Advisor approval for any registration change — this has been sent to your Advisor."
        : "This course is outside your standard, on-track semester plan, so it needs Advisor approval — this has been sent to your Advisor.",
    });
  }

  await prisma.studentEnrollment.create({ data: { studentId: student.id, courseId: course.id, isRepeat: false } });
  return NextResponse.json({ ok: true, pendingApproval: false });
}
