import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Chairman approves or rejects a teacher assignment for a course in their own department.
// Rejecting removes the teacher again so the Course Assigner has to choose someone else.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "HEAD_OF_DEPARTMENT") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision;
  if (!body.courseId || (decision !== "APPROVE" && decision !== "REJECT")) return NextResponse.json({ error: "courseId and decision are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (decision === "REJECT" && !note) return NextResponse.json({ error: "please give a short reason for rejecting" }, { status: 400 });

  const course = await prisma.course.findFirst({
    where: { id: body.courseId, instructorApproval: "PENDING", coordinator: { managedById: user.managedById || "", departmentId: user.departmentId || "none" } },
  });
  if (!course) return NextResponse.json({ error: "nothing to approve for this course" }, { status: 404 });

  const now = new Date();
  await prisma.course.update({
    where: { id: course.id },
    data: decision === "APPROVE"
      ? { instructorApproval: "APPROVED", instructorApprovedById: user.id, instructorApprovedAt: now, instructorApprovalNote: note || null }
      : { instructorApproval: "REJECTED", instructorApprovedById: user.id, instructorApprovedAt: now, instructorApprovalNote: note, instructorId: null },
  });
  await writeAuditLog({
    actorUserId: user.id, action: decision === "APPROVE" ? "INSTRUCTOR_APPROVED" : "INSTRUCTOR_REJECTED", entityType: "Course", entityId: course.id,
    metadata: { instructorId: course.instructorId || "none", note },
  });
  return NextResponse.json({ ok: true });
}
