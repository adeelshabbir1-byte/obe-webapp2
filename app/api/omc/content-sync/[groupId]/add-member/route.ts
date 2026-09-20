import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { reconsiderGroupBase } from "../../../../../../lib/contentSync";
import { pairForEquivalence } from "../../../../../../lib/equivalencePairing";

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

  // Only updates membership and flags the group as needing a sync — no
  // immediate content copy. See "Sync All Content" for when that
  // actually happens.
  await prisma.courseContentSyncMember.create({ data: { groupId: params.groupId, courseId, isBase: false } });
  // The newly-added course might actually be more senior than the
  // group's current base — re-checked here rather than assuming the
  // existing base stays correct just because it was added second.
  await reconsiderGroupBase(params.groupId, courseId);
  await prisma.courseContentSyncGroup.update({ where: { id: params.groupId }, data: { needsSync: true } });
  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_MEMBER_ADDED", entityType: "CourseContentSyncGroup", entityId: params.groupId, metadata: { courseId } });

  // If the newly-added course turns out to actually be offered in the
  // same term as any existing member, they're genuinely the same real
  // class running twice — combine them for teaching too, same as
  // /pair and /group-multiple already do. This check was previously
  // missing from this specific path, which is why courses added this
  // way could stay content-linked without ever becoming equivalent.
  const newCourse = await prisma.course.findUnique({ where: { id: courseId } });
  const otherMembers = await prisma.courseContentSyncMember.findMany({ where: { groupId: params.groupId, courseId: { not: courseId } }, include: { course: true } });
  if (newCourse?.offeredTermName) {
    for (const m of otherMembers) {
      if (m.course.offeredTermName === newCourse.offeredTermName && m.course.offeredTermYear === newCourse.offeredTermYear) {
        await pairForEquivalence(newCourse.id, m.course.id, user.managedById, user.id, true);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
