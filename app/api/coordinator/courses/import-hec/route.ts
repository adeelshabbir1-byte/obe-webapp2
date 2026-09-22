import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { copyBenchmarkIfAvailable, getBenchmarkCandidates, seedFromMasterCourseIfAvailable } from "../../../../../lib/benchmarkCopy";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.batchId) {
    return NextResponse.json({ error: "batchId is required — select or create a batch first" }, { status: 400 });
  }
  if (!body.curriculumId) {
    return NextResponse.json({ error: "curriculumId is required — select which master curriculum to import" }, { status: 400 });
  }
  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) {
    return NextResponse.json({ error: "invalid batch" }, { status: 400 });
  }

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: body.curriculumId },
    include: { courses: true },
  });
  if (!curriculum) return NextResponse.json({ error: "curriculum not found" }, { status: 404 });

  // Fetch everything we need ONCE up front, instead of once per course in
  // the loop below — the per-course version of this was slow enough on a
  // 40+ course curriculum to time out the request.
  const [existingInBatch, benchmarkCandidates] = await Promise.all([
    prisma.course.findMany({ where: { coordinatorId: user.id, batchId: batch.id }, select: { code: true, masterCourseId: true } }),
    getBenchmarkCandidates(user.id),
  ]);
  const existingCodes = new Set(existingInBatch.map((c) => c.code));
  const importedIds = new Set(existingInBatch.map((c) => c.masterCourseId).filter(Boolean));

  const toImport = curriculum.courses.filter((mc) => !importedIds.has(mc.id) && (!Array.isArray(body.courseIds) || body.courseIds.includes(mc.id)));

  let created = 0;
  let benchmarksCopied = 0;
  const errors: string[] = [];

  for (const mc of toImport) {
    try {
      let code = mc.code;
      if (existingCodes.has(code)) code = `${mc.code}-${curriculum.version}`;
      existingCodes.add(code);

      const newCourse = await prisma.course.create({
        data: {
          code, title: mc.title, creditHours: mc.creditHours,
          courseType: mc.category, semesterNumber: mc.semesterNumber,
          textbook: mc.textbook, catalogDescription: mc.catalogDescription, referenceMaterial: mc.referenceMaterial,
          coordinatorId: user.id, batchId: batch.id, masterCourseId: mc.id,
        },
      });
      created++;

      const benchmark = await copyBenchmarkIfAvailable(newCourse.id, user.id, mc.id, code, benchmarkCandidates);
      if (benchmark) benchmarksCopied++;
      else await seedFromMasterCourseIfAvailable(newCourse.id, mc.id);
    } catch (err: any) {
      errors.push(`${mc.code}: ${err?.message || "failed"}`);
    }
  }

  await writeAuditLog({
    actorUserId: user.id, action: "HEC_CURRICULUM_BULK_IMPORTED", entityType: "Batch", entityId: batch.id,
    metadata: { count: created, curriculumId: curriculum.id, benchmarksCopied, errorCount: errors.length },
  });

  // Rare, one-time bulk action — returning this batch's full fresh
  // course list here (not the whole page's data across every batch) is
  // still far cheaper than a full page refetch, and lets the client
  // update immediately without guessing which courses actually landed.
  const freshCourses = await prisma.course.findMany({
    where: { batchId: batch.id },
    include: { batch: { select: { batchName: true } } },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });
  return NextResponse.json({
    created, skipped: toImport.length - created - errors.length, alreadyPresent: importedIds.size, benchmarksCopied,
    errors: errors.length > 0 ? errors : undefined,
    courses: freshCourses.map((c) => ({
      id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType, semesterNumber: c.semesterNumber,
      fromHec: !!c.masterCourseId, subjectExpertId: c.subjectExpertId, batchName: c.batch?.batchName ?? null, fromBenchmark: !!c.benchmarkSourceId,
      prerequisiteCourseId: c.prerequisiteCourseId, batchId: c.batchId, hasLab: c.hasLab,
    })),
  });
}
