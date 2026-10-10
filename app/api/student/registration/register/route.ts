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

  // An elective that belongs to a slot group is chosen through that group's one-choice form, never registered directly.
  const inSlotGroup = await prisma.electiveSlotOption.findFirst({ where: { courseId: course.id }, select: { id: true } });
  if (inSlotGroup) return NextResponse.json({ error: "This elective is part of an elective choice group. Pick it through the choice form your Program Lead shared." }, { status: 400 });

  // Prerequisite must be passed first.
  if (course.prerequisiteCourseId) {
    const pre = await prisma.course.findUnique({ where: { id: course.prerequisiteCourseId }, select: { code: true, title: true } });
    if (pre) {
      const done = await prisma.studentTranscriptRecord.findFirst({ where: { studentId: student.id, courseCode: pre.code, OR: [{ gpaPoints: { gt: 0 } }, { grade: "P" }] }, select: { id: true } });
      if (!done) return NextResponse.json({ error: `You need to pass ${pre.code} ${pre.title} before registering for this course.` }, { status: 400 });
    }
  }

  // Credit limit for the semester, when the Program Lead has set one.
  const lead = await prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { maxCreditsPerSemester: true } });
  if (lead?.maxCreditsPerSemester) {
    const current = await prisma.studentEnrollment.findMany({ where: { studentId: student.id, course: { isOffered: true } }, select: { course: { select: { creditHours: true } } } });
    const used = current.reduce((n, e) => n + (e.course?.creditHours || 0), 0);
    if (used + course.creditHours > lead.maxCreditsPerSemester) return NextResponse.json({ error: `This would take you to ${used + course.creditHours} credit hours; the limit is ${lead.maxCreditsPerSemester}.` }, { status: 400 });
  }

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
