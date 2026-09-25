import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { copyCourseContent } from "../../../../../lib/benchmarkCopy";
import { deleteCourseCompletely } from "../../../../../lib/deleteCourseCompletely";
import { linkAsFollowerOfSource } from "../../../../../lib/contentSync";
import { electiveTitleFor } from "../../../../../lib/electiveNaming";

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

  const [sourceBatch, targetBatch] = await Promise.all([
    prisma.batch.findUnique({ where: { id: body.sourceBatchId } }),
    prisma.batch.findUnique({ where: { id: body.targetBatchId } }),
  ]);
  if (!sourceBatch || sourceBatch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid source batch" }, { status: 400 });
  if (!targetBatch || targetBatch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid target batch" }, { status: 400 });

  let deleted = 0;
  if (body.replaceExisting) {
    const existingTargetCourses = await prisma.course.findMany({ where: { batchId: targetBatch.id }, select: { id: true } });
    for (const c of existingTargetCourses) {
      await deleteCourseCompletely(c.id);
      deleted++;
    }
  }

  const [sourceCourses, existingInTarget] = await Promise.all([
    prisma.course.findMany({ where: { batchId: sourceBatch.id } }),
    prisma.course.findMany({ where: { batchId: targetBatch.id }, select: { code: true } }),
  ]);
  const existingCodes = new Set(existingInTarget.map((c) => c.code));
  // Numbering continues from however many Elective-type courses the
  // target batch already has, regardless of how the source batch's own
  // electives happened to be titled.
  const existingElectiveCount = (await prisma.course.count({ where: { batchId: targetBatch.id, courseType: "Elective" } }));
  let electiveCounter = existingElectiveCount;

  let created = 0;
  let skippedAsExisting = 0;
  const errors: string[] = [];

  for (const sc of sourceCourses) {
    try {
      // Skip (don't rename-and-duplicate) if this code already exists in
      // the target — running this more than once on the same pair
      // shouldn't keep piling up "-copy", "-copy-copy" duplicates.
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

  await writeAuditLog({
    actorUserId: user.id, action: "BATCH_COURSES_COPIED", entityType: "Batch", entityId: targetBatch.id,
    metadata: { sourceBatchId: sourceBatch.id, created, deleted, skippedAsExisting, errorCount: errors.length },
  });

  // Same reasoning as import-hec: this is a rare bulk action, and most
  // or all of the target batch's courses just changed (possibly every
  // one, if replaceExisting was used), so returning the full fresh list
  // for just this batch is both correct and still far cheaper than a
  // full page refetch.
  const freshCourses = await prisma.course.findMany({
    where: { batchId: targetBatch.id },
    include: { batch: { select: { batchName: true } } },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });
  return NextResponse.json({
    created, deleted, skippedAsExisting, errors: errors.length > 0 ? errors : undefined,
    courses: freshCourses.map((c) => ({
      id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType, semesterNumber: c.semesterNumber,
      fromHec: !!c.masterCourseId, subjectExpertId: c.subjectExpertId, batchName: c.batch?.batchName ?? null, fromBenchmark: !!c.benchmarkSourceId,
      prerequisiteCourseId: c.prerequisiteCourseId, batchId: c.batchId, hasLab: c.hasLab,
    })),
  });
}
