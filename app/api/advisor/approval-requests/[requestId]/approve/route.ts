import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { studentContext, checkCourses } from "../../../../../../lib/registrationRules";
import { withErrors } from "../../../../../../lib/apiHandler";

// Approving actually performs the underlying register/withdraw right
// now — the request was only ever a hold on the action, not the action
// itself, so nothing changed for the student until this point.
async function POST_handler(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const request = await prisma.registrationApprovalRequest.findUnique({
    where: { id: params.requestId },
    include: { student: { include: { batch: true } }, course: true },
  });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.student.batch.advisorId !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (request.status !== "PENDING") return NextResponse.json({ error: `already ${request.status.toLowerCase()}` }, { status: 400 });

  if (request.actionType === "REGISTER") {
    const existing = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: request.studentId, courseId: request.courseId } } });
    // The institute's registration rules still apply; only the Institute Head can exempt a student from them.
    if (!existing) {
      const ctx = await studentContext(request.studentId);
      const check = ctx ? await checkCourses(ctx, [request.course]) : null;
      if (check?.blocked.length) return NextResponse.json({ error: `Can't approve: ${check.blocked[0].reason} Ask the Institute Head for an exemption if this should be allowed.` }, { status: 400 });
    }
    if (!existing) await prisma.studentEnrollment.create({ data: { studentId: request.studentId, courseId: request.courseId, isRepeat: false } });
  } else {
    const enrollment = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: request.studentId, courseId: request.courseId } } });
    if (enrollment) {
      await prisma.studentMark.deleteMany({ where: { studentId: request.studentId, courseId: request.courseId } });
      await prisma.studentEnrollment.delete({ where: { id: enrollment.id } });
    }
  }

  await prisma.registrationApprovalRequest.update({ where: { id: request.id }, data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "REGISTRATION_APPROVAL_APPROVED", entityType: "Course", entityId: request.courseId, metadata: { studentId: request.studentId, actionType: request.actionType } });

  { const c = await prisma.course.findUnique({ where: { id: request.courseId }, select: { code: true } }); await (await import("../../../../../../lib/studentAlerts")).tellStudents([request.studentId], "REGISTRATION", `Advisor approved: ${request.actionType === "WITHDRAW" ? "withdraw from" : "register in"} ${c?.code || "the course"}`, undefined, "/student/registration"); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
