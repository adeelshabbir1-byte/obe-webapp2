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
// (seedFromMasterCourseIfAvailable), across every eligible course in
// every one of the Coordinator's own batches, in small chunks per
// call (the client loops this automatically) rather than all at once
// in one request — a single request covering potentially hundreds of
// courses, each needing several sequential DB round-trips, risks
// exceeding the serverless function's time limit and returning an
// empty, unparseable response. Eligible = linked to a MasterCourse,
// has no existing CLOs yet (so nobody's own work is ever touched or
// overwritten), and isn't a content-sync follower course (those
// inherit from their base course automatically and are never edited
// directly).
const CHUNK_SIZE = 15;

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let cursor: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.cursor === "string") cursor = body.cursor;
  } catch {
    // no body sent — first call, no cursor yet
  }

  // Ordered and cursored by id so every round makes guaranteed forward
  // progress through the full candidate set, regardless of outcome. A
  // skipped course (no template content yet, or a follower course)
  // never gains CLOs, so it would otherwise still match this same
  // "eligible" query forever and get re-fetched every round — this is
  // exactly the bug that showed up as the count stalling round after
  // round on the same handful of stuck courses.
  const candidates = await prisma.course.findMany({
    where: {
      coordinatorId: user.id,
      masterCourseId: { not: null },
      clos: { none: { source: "SE" } },
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: { id: true, code: true, title: true, masterCourseId: true, batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: { id: "asc" },
    take: CHUNK_SIZE,
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

  const nextCursor = candidates.length > 0 ? candidates[candidates.length - 1].id : undefined;
  const mightHaveMore = candidates.length === CHUNK_SIZE;

  await writeAuditLog({
    actorUserId: user.id, action: "BULK_HEC_CONTENT_LOADED",
    metadata: { seeded, skippedFollower, skippedNoContent, candidateCount: candidates.length },
  });

  return NextResponse.json({
    seeded, skippedFollower, skippedNoContent, mightHaveMore, nextCursor,
    perBatch: Array.from(perBatch.values()).sort((a, b) => a.batchLabel.localeCompare(b.batchLabel)),
  });
}
