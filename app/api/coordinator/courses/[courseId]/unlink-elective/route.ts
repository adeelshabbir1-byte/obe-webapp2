import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Resets an Elective-type course back to a genuinely unfilled slot —
// specifically for elective placeholders that got silently pre-filled
// with a PREVIOUS batch's specific course choice by the auto-copy-from-
// previous-batch bug (fixed separately in lib/autoCopyPreviousBatch.ts):
// the title still read as a generic "Elective N", but its masterCourseId
// already pointed at a real, already-chosen course, which stopped the
// "choose a course for this slot" popup on Prerequisite Map / Course
// Repositioning from opening for it. This is the retroactive fix for any
// course that already got created that way before the code fix landed.
export async function PUT(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (course.courseType !== "Elective") return NextResponse.json({ error: "only Elective-type courses can be reset to unfilled" }, { status: 400 });

  const updated = await prisma.course.update({ where: { id: course.id }, data: { masterCourseId: null } });

  await writeAuditLog({ actorUserId: user.id, action: "ELECTIVE_SLOT_UNLINKED", entityType: "Course", entityId: course.id, metadata: { code: course.code } });

  return NextResponse.json({ ok: true, course: updated });
}
