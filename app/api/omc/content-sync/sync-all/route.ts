import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { syncCourseContentToLinkedCourses } from "../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../lib/audit";

// The one place actual content copying happens for linking — every link
// action (pair, group-multiple, add-member, set-base) only ever flags a
// group as needsSync; this is what actually performs the copy, for
// every pending group at once, run explicitly rather than surprising
// the person on every click.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const pendingGroups = await prisma.courseContentSyncGroup.findMany({
    where: { chairmanId: user.managedById, needsSync: true },
    include: { members: { where: { isBase: true }, include: { course: true } } },
  });

  let groupsSynced = 0;
  let coursesSynced = 0;
  let coursesSkippedGraded = 0;
  const failures: string[] = [];

  // One group at a time, not in parallel — same reasoning as
  // everywhere else in this feature: a small connection pool means
  // concurrent requests risk contention rather than saving time.
  for (const group of pendingGroups) {
    const base = group.members[0];
    if (!base) { failures.push(`${group.name}: no base course set`); continue; }
    try {
      const result = await syncCourseContentToLinkedCourses(base.courseId);
      coursesSynced += result.synced.length;
      coursesSkippedGraded += result.skippedGraded.length;
      await prisma.courseContentSyncGroup.update({ where: { id: group.id }, data: { needsSync: false } });
      groupsSynced++;
    } catch (err: any) {
      failures.push(`${group.name}: ${err.message}`);
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_ALL_RUN", entityType: "CourseContentSyncGroup", entityId: "bulk", metadata: { groupsSynced, coursesSynced } });

  return NextResponse.json({ groupsSynced, coursesSynced, coursesSkippedGraded, failures, totalPending: pendingGroups.length });
}
