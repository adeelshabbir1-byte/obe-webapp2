import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../lib/contentSync";
import { seedFromMasterCourseIfAvailable } from "../../../../lib/benchmarkCopy";
import { writeAuditLog } from "../../../../lib/audit";

// The one-at-a-time "Load HEC Content" button (Subject Expert side)
// only ever touches a single course. With hundreds of courses now
// carrying seeded CLOs/lectures at the MasterCourse template level,
// waiting for every Subject Expert to click that button individually
// on every course is impractical — this does the same underlying copy
// (seedFromMasterCourseIfAvailable), but across every eligible course
// in every one of the Coordinator's own batches in a single request.
// Eligible = linked to a MasterCourse, has no existing CLOs yet (so
// nobody's own work is ever touched or overwritten), and isn't a
// content-sync follower course (those inherit from their base course
// automatically and are never edited directly).
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const candidates = await prisma.course.findMany({
    where: {
      coordinatorId: user.id,
      masterCourseId: { not: null },
      clos: { none: { source: "SE" } },
    },
    select: { id: true, code: true, title: true, masterCourseId: true, batch: { select: { degreeProgram: true, batchName: true } } },
  });

  let seeded = 0;
  let skippedFollower = 0;
  let skippedNoContent = 0;
  const perBatch = new Map<string, { batchLabel: string; seeded: number }>();

  for (const course of candidates) {
    const blocked = await blockedAsNonBaseCourse(course.id);
    if (blocked) { skippedFollower++; continue; }

    const result = await seedFromMasterCourseIfAvailable(course.id, course.masterCourseId);
    if (!result) { skippedNoContent++; continue; }

    await syncCourseContentToLinkedCourses(course.id);
    seeded++;
    const batchLabel = course.batch ? `${course.batch.degreeProgram} — ${course.batch.batchName}` : "—";
    const entry = perBatch.get(batchLabel) || { batchLabel, seeded: 0 };
    entry.seeded++;
    perBatch.set(batchLabel, entry);
  }

  await writeAuditLog({
    actorUserId: user.id, action: "BULK_HEC_CONTENT_LOADED",
    metadata: { seeded, skippedFollower, skippedNoContent, candidateCount: candidates.length },
  });

  return NextResponse.json({
    seeded, skippedFollower, skippedNoContent,
    perBatch: Array.from(perBatch.values()).sort((a, b) => a.batchLabel.localeCompare(b.batchLabel)),
  });
}
