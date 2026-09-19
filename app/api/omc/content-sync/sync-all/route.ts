import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { syncCourseContentToLinkedCourses } from "../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../lib/audit";

// The one place actual content copying happens for linking — every link
// action (pair, group-multiple, add-member, set-base) only ever flags a
// group as needsSync; this is what actually performs the copy.
//
// Processes only a small BATCH of pending groups per call (default 3),
// not all of them — with dozens of groups pending, each needing a full
// content copy, a single request trying to do everything at once is
// exactly the kind of thing that runs past a serverless function's
// execution time limit. Since nothing is marked synced until its own
// copy actually finishes, a mid-request timeout would leave the pending
// count looking completely unchanged, which is indistinguishable from
// "did nothing" from the outside. The caller is expected to keep calling
// this repeatedly (using the returned remainingPending) until it reaches
// zero, showing progress along the way instead of one long silent wait.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 3, 1), 10);

  const [pendingGroups, totalPendingCount] = await Promise.all([
    prisma.courseContentSyncGroup.findMany({
      where: { chairmanId: user.managedById, needsSync: true },
      include: { members: { where: { isBase: true }, include: { course: true } } },
      take: batchSize,
      orderBy: { id: "asc" },
    }),
    prisma.courseContentSyncGroup.count({ where: { chairmanId: user.managedById, needsSync: true } }),
  ]);

  let groupsSynced = 0;
  let coursesSynced = 0;
  let coursesSkippedGraded = 0;
  let coursesSkippedOlderBatch = 0;
  const failures: string[] = [];

  // One group at a time, not in parallel — same reasoning as
  // everywhere else in this feature: a small connection pool means
  // concurrent requests risk contention rather than saving time.
  for (const group of pendingGroups) {
    const base = group.members[0];
    if (!base) {
      failures.push(`${group.name}: no base course set`);
      // Still clear the flag — a group with no base will never resolve
      // otherwise, and it would keep this batch stuck retrying it forever.
      await prisma.courseContentSyncGroup.update({ where: { id: group.id }, data: { needsSync: false } });
      continue;
    }
    try {
      const result = await syncCourseContentToLinkedCourses(base.courseId);
      coursesSynced += result.synced.length;
      coursesSkippedGraded += result.skippedGraded.length;
      coursesSkippedOlderBatch += result.skippedOlderBatch.length;
      await prisma.courseContentSyncGroup.update({ where: { id: group.id }, data: { needsSync: false } });
      groupsSynced++;
    } catch (err: any) {
      failures.push(`${group.name}: ${err.message}`);
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_ALL_RUN", entityType: "CourseContentSyncGroup", entityId: "bulk", metadata: { groupsSynced, coursesSynced } });

  const remainingPending = Math.max(0, totalPendingCount - groupsSynced - failures.length);
  return NextResponse.json({ groupsSynced, coursesSynced, coursesSkippedGraded, coursesSkippedOlderBatch, failures, totalPending: totalPendingCount, remainingPending });
}
