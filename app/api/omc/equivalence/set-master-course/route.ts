import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// Manually sets (or clears) which HEC/standard-curriculum MasterCourse a
// real course is equated with — most courses already got this
// automatically when adopted from a MasterCurriculum import, but many
// weren't (older batches, manually-added courses), and this is how
// those get linked by hand. Once set, this becomes the course's
// identity for HEC PLO suggestion lookups (see auto-map-hec and the
// PLO-Course Matrix page) instead of relying on the course's own code
// string happening to match HEC's convention exactly.
//
// Pass either courseId (a single course) or groupId (every course
// currently in that Course Equivalence group at once) — a group
// represents "the same real course across batches", so they share one
// HEC link rather than needing it set separately per batch.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { courseId, groupId, masterCourseId } = body; // masterCourseId may be null, to clear the link
  if (!courseId && !groupId) return NextResponse.json({ error: "courseId or groupId is required" }, { status: 400 });

  if (masterCourseId) {
    const masterCourse = await prisma.masterCourse.findUnique({ where: { id: masterCourseId } });
    if (!masterCourse) return NextResponse.json({ error: "that master course wasn't found" }, { status: 404 });
  }

  let updatedCount: number;
  if (groupId) {
    const result = await prisma.course.updateMany({ where: { equivalenceMember: { groupId } }, data: { masterCourseId: masterCourseId || null } });
    updatedCount = result.count;
  } else {
    await prisma.course.update({ where: { id: courseId }, data: { masterCourseId: masterCourseId || null } });
    updatedCount = 1;
  }

  await writeAuditLog({ actorUserId: user.id, action: "COURSE_MASTER_LINK_SET", entityType: "Course", entityId: courseId || groupId, metadata: { masterCourseId: masterCourseId || "cleared", updatedCount } });

  return NextResponse.json({ ok: true, updatedCount });
}
