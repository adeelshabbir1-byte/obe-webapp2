import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";
import { needsAdvisorApproval } from "../../../../../lib/academicStanding";
import { studentContext, selfRegistrationBlock, checkCourses } from "../../../../../lib/registrationRules";

export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId } });
  if (!batch || !batch.registrationOpen) return NextResponse.json({ error: "Registration isn't open for your batch right now." }, { status: 400 });

  { const fee = await (await import("../../../../../lib/feeClearance")).feeBlock(student.id, "registration"); if (fee) return NextResponse.json({ error: fee }, { status: 400 }); }
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

  // Institute registration rules (Registration Rules page): who may self-register, earned-credit requirements such as
  // FYP, prerequisites, the new-course limit for low CGPA and the semester load. Institute Head exemptions apply.
  const ctx = await studentContext(student.id);
  if (!ctx) return NextResponse.json({ error: "student record not found" }, { status: 400 });
  const selfBlock = selfRegistrationBlock(ctx);
  if (selfBlock) return NextResponse.json({ error: selfBlock }, { status: 403 });
  const check = await checkCourses(ctx, [course]);
  if (check.blocked.length) return NextResponse.json({ error: check.blocked[0].reason }, { status: 400 });

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
