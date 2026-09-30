import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { blockedAsNonBaseCourse } from "../../../../../../lib/contentSync";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json();
  const subjectExpertId = body.subjectExpertId || null;

  // Only actually ASSIGNING someone is blocked on a non-base course —
  // clearing an assignment (subjectExpertId: null) is always fine.
  if (subjectExpertId) {
    const blocked = await blockedAsNonBaseCourse(course.id);
    if (blocked) return NextResponse.json({ error: blocked.replace("edited directly", "assigned a Subject Expert directly") }, { status: 409 });
  }

  if (subjectExpertId) {
    const se = await prisma.user.findUnique({ where: { id: subjectExpertId } });
    if (!se || se.role !== "SUBJECT_EXPERT" || se.managedById !== user.id) {
      return NextResponse.json({ error: "invalid subject expert" }, { status: 400 });
    }
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { subjectExpertId } });

  await writeAuditLog({
    actorUserId: user.id, action: "SUBJECT_EXPERT_ASSIGNED", entityType: "Course", entityId: course.id,
    metadata: { subjectExpertId: subjectExpertId || "none" },
  });

  return NextResponse.json({ course: updated });
}
