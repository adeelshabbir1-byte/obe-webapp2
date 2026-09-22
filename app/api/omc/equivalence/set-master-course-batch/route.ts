import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// Batch version of set-master-course: applies many contentSyncGroupId
// -> masterCourseId links in one request instead of one round-trip per
// selection. Lets the OMC pick HEC courses for several groups locally,
// then commit them all with one Save — much faster than saving (and
// re-fetching everything) on every single click.
//
// Body: { links: [{ contentSyncGroupId, masterCourseId | null }] }
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const links = body.links;
  if (!Array.isArray(links) || links.length === 0) return NextResponse.json({ error: "links must be a non-empty array" }, { status: 400 });
  for (const l of links) {
    if (!l.contentSyncGroupId) return NextResponse.json({ error: "each link needs a contentSyncGroupId" }, { status: 400 });
  }

  const masterCourseIds = [...new Set(links.map((l: any) => l.masterCourseId).filter(Boolean))];
  if (masterCourseIds.length > 0) {
    const found = await prisma.masterCourse.findMany({ where: { id: { in: masterCourseIds } }, select: { id: true } });
    const foundIds = new Set(found.map((f) => f.id));
    const missing = masterCourseIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) return NextResponse.json({ error: "one or more master courses weren't found", missing }, { status: 404 });
  }

  await prisma.$transaction(
    links.map((l: any) =>
      prisma.course.updateMany({ where: { contentSyncMember: { groupId: l.contentSyncGroupId } }, data: { masterCourseId: l.masterCourseId || null } })
    )
  );

  await writeAuditLog({ actorUserId: user.id, action: "COURSE_MASTER_LINK_SET_BATCH", entityType: "ContentSyncGroup", entityId: links[0].contentSyncGroupId, metadata: { count: links.length } });

  // Return the fresh masterCourse info for every affected group, so the
  // client can update its local groups list directly.
  const updatedGroups = await prisma.courseContentSyncGroup.findMany({
    where: { id: { in: links.map((l: any) => l.contentSyncGroupId) } },
    include: { members: { include: { course: { include: { masterCourse: { select: { id: true, code: true, title: true } } } } }, take: 1 } },
  });

  return NextResponse.json({
    updated: updatedGroups.map((g) => ({ groupId: g.id, masterCourse: g.members[0]?.course.masterCourse ?? null })),
  });
}
