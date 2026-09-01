import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { copyBenchmarkIfAvailable } from "../../../../../lib/benchmarkCopy";

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

  // Scoped to this batch specifically — the same curriculum CAN be imported
  // again into a different batch, since each batch tracks its own courses.
  const alreadyImported = await prisma.course.findMany({
    where: { coordinatorId: user.id, batchId: batch.id, masterCourseId: { not: null } },
    select: { masterCourseId: true },
  });
  const importedIds = new Set(alreadyImported.map((c) => c.masterCourseId));

  const toImport = curriculum.courses.filter((mc) => !importedIds.has(mc.id));

  let created = 0;
  let benchmarksCopied = 0;
  for (const mc of toImport) {
    let code = mc.code;
    const codeClash = await prisma.course.findFirst({ where: { coordinatorId: user.id, batchId: batch.id, code } });
    if (codeClash) code = `${mc.code}-${curriculum.version}`;

    const newCourse = await prisma.course.create({
      data: {
        code, title: mc.title, creditHours: mc.creditHours,
        courseType: mc.category, semesterNumber: mc.semesterNumber,
        coordinatorId: user.id, batchId: batch.id, masterCourseId: mc.id,
      },
    });
    created++;

    const benchmark = await copyBenchmarkIfAvailable(newCourse.id, user.id, mc.id, code);
    if (benchmark) benchmarksCopied++;
  }

  await writeAuditLog({
    actorUserId: user.id, action: "HEC_CURRICULUM_BULK_IMPORTED", entityType: "Batch", entityId: batch.id,
    metadata: { count: created, curriculumId: curriculum.id, benchmarksCopied },
  });

  return NextResponse.json({ created, skipped: toImport.length - created, alreadyPresent: importedIds.size, benchmarksCopied });
}
