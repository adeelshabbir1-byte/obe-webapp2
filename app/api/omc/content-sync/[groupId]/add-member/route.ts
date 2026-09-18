import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";

// Adds a course directly to an existing group, as a follower — the
// direct equivalent of the "pair" endpoint's "memberA && !memberB"
// case, but reachable straight from a specific group in the UI rather
// than needing to pick that group's base again in a separate dropdown.
export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.courseContentSyncGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.chairmanId !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const { courseId } = body;
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const existingMembership = await prisma.courseContentSyncMember.findUnique({ where: { courseId } });
  if (existingMembership) {
    if (existingMembership.groupId === params.groupId) return NextResponse.json({ ok: true }); // already in this group
    return NextResponse.json({ error: "that course is already linked in a different group — unlink it from there first" }, { status: 409 });
  }

  await prisma.courseContentSyncMember.create({ data: { groupId: params.groupId, courseId, isBase: false } });
  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_MEMBER_ADDED", entityType: "CourseContentSyncGroup", entityId: params.groupId, metadata: { courseId } });

  const groupBase = await prisma.courseContentSyncMember.findFirst({ where: { groupId: params.groupId, isBase: true } });
  const result = groupBase ? await syncCourseContentToLinkedCourses(groupBase.courseId) : { synced: [], skippedGraded: [] };

  return NextResponse.json({ ok: true, ...result });
}
