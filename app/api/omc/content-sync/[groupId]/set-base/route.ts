import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { syncSubjectExpertToLinkedCourses, syncGroupSubjectHome } from "../../../../../../lib/contentSync";

export async function PUT(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.courseContentSyncGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.chairmanId !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const { courseId } = body;
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const member = await prisma.courseContentSyncMember.findFirst({ where: { groupId: params.groupId, courseId } });
  if (!member) return NextResponse.json({ error: "that course isn't in this group" }, { status: 404 });
  if (member.isBase) return NextResponse.json({ ok: true }); // already the base

  // The course losing base status is about to become read-only, so its
  // own SE assignment is cleared. But that assignment shouldn't just
  // vanish — carry it forward onto the new base (and out to the rest of
  // the group) the same way every other base-change path does, so
  // switching the base manually here doesn't silently strand a course
  // without a Subject Expert.
  const previousBase = await prisma.courseContentSyncMember.findFirst({ where: { groupId: params.groupId, isBase: true } });
  const previousBaseCourse = previousBase
    ? await prisma.course.findUnique({ where: { id: previousBase.courseId }, select: { subjectExpertId: true } })
    : null;
  const newBaseCourse = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinatorId: true } });

  await prisma.$transaction([
    prisma.courseContentSyncMember.updateMany({ where: { groupId: params.groupId }, data: { isBase: false } }),
    prisma.courseContentSyncMember.update({ where: { id: member.id }, data: { isBase: true } }),
    // Switching the base doesn't copy content immediately either — it
    // just flags the group as needing a sync, same as every other link
    // action. "Sync All Content" propagates the new base's content out
    // once it's actually run.
    prisma.courseContentSyncGroup.update({ where: { id: params.groupId }, data: { needsSync: true } }),
  ]);
  await syncGroupSubjectHome(params.groupId);
  if (previousBase) {
    await prisma.course.update({ where: { id: previousBase.courseId }, data: { subjectExpertId: null } });
  }
  if (previousBaseCourse?.subjectExpertId && newBaseCourse) {
    const se = await prisma.user.findUnique({ where: { id: previousBaseCourse.subjectExpertId }, select: { managedById: true } });
    if (se?.managedById === newBaseCourse.coordinatorId) {
      await prisma.course.update({ where: { id: courseId }, data: { subjectExpertId: previousBaseCourse.subjectExpertId } });
      await syncSubjectExpertToLinkedCourses(courseId, previousBaseCourse.subjectExpertId);
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_BASE_CHANGED", entityType: "CourseContentSyncGroup", entityId: params.groupId, metadata: { newBaseCourseId: courseId } });

  return NextResponse.json({ ok: true });
}
