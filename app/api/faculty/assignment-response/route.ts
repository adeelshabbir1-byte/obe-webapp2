import { NextRequest, NextResponse } from "next/server";
import { notifyUsers } from "../../../../lib/notifications";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { syncSubjectExpertToLinkedCourses } from "../../../../lib/contentSync";

// A teacher accepts or declines a course given to them: a borrowed teacher (from another department), or any Subject
// Expert (every new Subject Expert assignment waits for their answer). Declining takes them off the course again so
// it can be given to someone else; the reason is shown to whoever assigns it next.
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
    // Its Lab (<CODE>-L, same batch) followed this assignment automatically, so the answer covers it too.
    const lab = course.courseType !== "Lab"
      ? await prisma.course.findFirst({ where: { coordinatorId: course.coordinatorId, batchId: course.batchId, code: `${course.code}-L`, courseType: "Lab", subjectExpertId: user.id, seResponse: "PENDING" } })
      : null;
    const declineNote = `${user.name}: ${note}`;
    for (const c of [course, ...(lab ? [lab] : [])]) {
      await prisma.course.update({ where: { id: c.id }, data: accept ? { seResponse: "ACCEPTED", seResponseNote: note || null } : { seResponse: "DECLINED", seResponseNote: declineNote, subjectExpertId: null } });
      if (!accept) await syncSubjectExpertToLinkedCourses(c.id, null);
    }
  } else {
    await prisma.course.update({
      where: { id: course.id },
      data: accept ? { instructorResponse: "ACCEPTED", instructorResponseNote: note || null } : { instructorResponse: "DECLINED", instructorResponseNote: note, instructorId: null, instructorApproval: "NONE", instructorApprovalNote: null, instructorApprovedById: null, instructorApprovedAt: null },
    });
  }
  await notifyUsers([course.coordinatorId], { kind: "ASSIGNMENT", title: `${user.name} ${accept ? "accepted" : "declined"} ${course.code}`, body: accept ? `${user.name} accepted ${course.code} ${course.title} as ${as === "SUBJECT_EXPERT" ? "Subject Expert" : "Instructor"}.` : `${user.name} declined ${course.code} ${course.title}: ${note}. Assign someone else.`, href: as === "SUBJECT_EXPERT" ? "/coordinator/assign-subject-experts" : "/coordinator/courses" });
  await writeAuditLog({ actorUserId: user.id, action: accept ? (as === "SUBJECT_EXPERT" ? "SE_ASSIGNMENT_ACCEPTED" : "BORROWED_ASSIGNMENT_ACCEPTED") : (as === "SUBJECT_EXPERT" ? "SE_ASSIGNMENT_DECLINED" : "BORROWED_ASSIGNMENT_DECLINED"), entityType: "Course", entityId: course.id, metadata: { as, note } });
  return NextResponse.json({ ok: true });
}
