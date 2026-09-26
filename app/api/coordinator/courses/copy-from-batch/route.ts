import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { copyCourseContent } from "../../../../../lib/benchmarkCopy";
import { deleteCourseCompletely } from "../../../../../lib/deleteCourseCompletely";
import { linkAsFollowerOfSource } from "../../../../../lib/contentSync";
import { electiveTitleFor } from "../../../../../lib/electiveNaming";

// copyCourseContent does several queries and inserts per course (CLOs,
// lecture rows, instruments, paper items) — for a batch of any real
// size, doing every source course in one request risked exactly what
// happened: Vercel's hard 300-second limit killing the function
// mid-way, leaving the target batch with only however many courses
// had completed before the cutoff. Chunked instead: the client calls
// this repeatedly, a handful of source courses per call, until every
// one has been processed. Already-copied courses (matched by code)
// are skipped every time, so a re-run after a partial failure simply
// picks up the remaining ones without duplicating anything.
const CHUNK_SIZE = 5;

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.sourceBatchId || !body.targetBatchId) {
    return NextResponse.json({ error: "sourceBatchId and targetBatchId are required" }, { status: 400 });
  }
  if (body.sourceBatchId === body.targetBatchId) {
    return NextResponse.json({ error: "source and target batch must be different" }, { status: 400 });
  }
  const cursor: string | undefined = typeof body.cursor === "string" ? body.cursor : undefined;
  const replaceExisting = !!body.replaceExisting;

  const [sourceBatch, targetBatch] = await Promise.all([
    prisma.batch.findUnique({ where: { id: body.sourceBatchId } }),
    prisma.batch.findUnique({ where: { id: body.targetBatchId } }),
  ]);
  if (!sourceBatch || sourceBatch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid source batch" }, { status: 400 });
  if (!targetBatch || targetBatch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid target batch" }, { status: 400 });

  // The "delete everything existing first" step only ever runs once,
  // on the first call of the sequence (no cursor yet) — repeating it
  // on every chunk would re-delete courses this same run just copied.
  let deleted = 0;
  if (replaceExisting && !cursor) {
    const existingTargetCourses = await prisma.course.findMany({ where: { batchId: targetBatch.id }, select: { id: true } });
    for (const c of existingTargetCourses) {
      await deleteCourseCompletely(c.id);
      deleted++;
    }
  }

  const [sourceCourses, existingInTarget] = await Promise.all([
    prisma.course.findMany({
      where: { batchId: sourceBatch.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: CHUNK_SIZE,
    }),
    prisma.course.findMany({ where: { batchId: targetBatch.id }, select: { code: true } }),
  ]);
  const existingCodes = new Set(existingInTarget.map((c) => c.code));
  const existingElectiveCount = await prisma.course.count({ where: { batchId: targetBatch.id, courseType: "Elective" } });
  let electiveCounter = existingElectiveCount;

  let created = 0;
  let skippedAsExisting = 0;
  const errors: string[] = [];

  for (const sc of sourceCourses) {
    try {
      // Skip (don't rename-and-duplicate) if this code already exists in
      // the target — running this more than once on the same pair
      // shouldn't keep piling up "-copy", "-copy-copy" duplicates, and
      // this is also exactly what makes a re-run after a partial
      // timeout safe: everything already copied is left alone.
      if (existingCodes.has(sc.code)) { skippedAsExisting++; continue; }
      existingCodes.add(sc.code);

      // Every Elective-type course gets a uniform "<Degree> Elective <N>"
      // title in the target batch — regardless of what it happened to
      // be called in the source — the same rule import-hec applies.
      const title = sc.courseType === "Elective" ? electiveTitleFor(targetBatch.degreeProgram, ++electiveCounter) : sc.title;

      const newCourse = await prisma.course.create({
        data: {
          code: sc.code, title, creditHours: sc.creditHours, courseType: sc.courseType, semesterNumber: sc.semesterNumber,
          coordinatorId: user.id, batchId: targetBatch.id, masterCourseId: sc.masterCourseId,
        },
      });
      created++;
      await copyCourseContent(sc.id, newCourse.id);
      // This target batch's course is a copy of the source batch's —
      // link them for content sync automatically, so future Subject
      // Expert updates on the source keep propagating forward instead
      // of this being a one-time snapshot that immediately drifts.
      if (user.managedById) await linkAsFollowerOfSource(sc.id, newCourse.id, user.managedById);
    } catch (err: any) {
      errors.push(`${sc.code}: ${err?.message || "failed"}`);
    }
  }

  const nextCursor = sourceCourses.length > 0 ? sourceCourses[sourceCourses.length - 1].id : undefined;
  const mightHaveMore = sourceCourses.length === CHUNK_SIZE;

  await writeAuditLog({
    actorUserId: user.id, action: "BATCH_COURSES_COPIED", entityType: "Batch", entityId: targetBatch.id,
    metadata: { sourceBatchId: sourceBatch.id, created, deleted, skippedAsExisting, errorCount: errors.length },
  });

  return NextResponse.json({
    created, deleted, skippedAsExisting, errors: errors.length > 0 ? errors : undefined,
    nextCursor, mightHaveMore,
  });
}
