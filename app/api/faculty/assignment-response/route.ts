import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { syncSubjectExpertToLinkedCourses } from "../../../../lib/contentSync";

// A borrowed teacher / Subject Expert accepts or declines a course given to them from another department.
// Declining takes them off the course again so it can be given to someone else.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const as = body.as === "SUBJECT_EXPERT" ? "SUBJECT_EXPERT" : "INSTRUCTOR";
  if (!body.courseId || (body.decision !== "ACCEPT" && body.decision !== "DECLINE")) return NextResponse.json({ error: "courseId and decision are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (body.decision === "DECLINE" && !note) return NextResponse.json({ error: "please give a short reason for declining" }, { status: 400 });

  const course = await prisma.course.findFirst({
    where: as === "SUBJECT_EXPERT" ? { id: body.courseId, subjectExpertId: user.id, seResponse: "PENDING" } : { id: body.courseId, instructorId: user.id, instructorResponse: "PENDING" },
  });
  if (!course) return NextResponse.json({ error: "nothing waiting for your answer on this course" }, { status: 404 });

  const accept = body.decision === "ACCEPT";
  if (as === "SUBJECT_EXPERT") {
    await prisma.course.update({ where: { id: course.id }, data: accept ? { seResponse: "ACCEPTED", seResponseNote: note || null } : { seResponse: "DECLINED", seResponseNote: note, subjectExpertId: null } });
    if (!accept) await syncSubjectExpertToLinkedCourses(course.id, null);
  } else {
    await prisma.course.update({
      where: { id: course.id },
      data: accept ? { instructorResponse: "ACCEPTED", instructorResponseNote: note || null } : { instructorResponse: "DECLINED", instructorResponseNote: note, instructorId: null, instructorApproval: "NONE", instructorApprovalNote: null, instructorApprovedById: null, instructorApprovedAt: null },
    });
  }
  await writeAuditLog({ actorUserId: user.id, action: accept ? "BORROWED_ASSIGNMENT_ACCEPTED" : "BORROWED_ASSIGNMENT_DECLINED", entityType: "Course", entityId: course.id, metadata: { as, note } });
  return NextResponse.json({ ok: true });
}
