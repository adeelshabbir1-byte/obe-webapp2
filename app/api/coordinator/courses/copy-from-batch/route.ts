import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { copyCourseContent } from "../../../../../lib/benchmarkCopy";

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

  const [sourceCourses, existingInTarget] = await Promise.all([
    prisma.course.findMany({ where: { batchId: sourceBatch.id } }),
    prisma.course.findMany({ where: { batchId: targetBatch.id }, select: { code: true } }),
  ]);
  const existingCodes = new Set(existingInTarget.map((c) => c.code));

  let created = 0;
  const errors: string[] = [];

  for (const sc of sourceCourses) {
    try {
      let code = sc.code;
      if (existingCodes.has(code)) code = `${sc.code}-copy`;
      existingCodes.add(code);

      const newCourse = await prisma.course.create({
        data: {
          code, title: sc.title, creditHours: sc.creditHours, courseType: sc.courseType, semesterNumber: sc.semesterNumber,
          coordinatorId: user.id, batchId: targetBatch.id, masterCourseId: sc.masterCourseId,
        },
      });
      created++;
      await copyCourseContent(sc.id, newCourse.id);
    } catch (err: any) {
      errors.push(`${sc.code}: ${err?.message || "failed"}`);
    }
  }

  await writeAuditLog({
    actorUserId: user.id, action: "BATCH_COURSES_COPIED", entityType: "Batch", entityId: targetBatch.id,
    metadata: { sourceBatchId: sourceBatch.id, created, errorCount: errors.length },
  });

  return NextResponse.json({ created, errors: errors.length > 0 ? errors : undefined });
}
