import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// Copies PLO-course mappings from a source batch to a target batch —
// matching courses by code and PLOs by number, the same convention used
// elsewhere (Course Equivalence pairing). Only fills in mappings the
// target course doesn't already have; never overwrites existing work.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { sourceBatchId, targetBatchId } = body;
  if (!sourceBatchId || !targetBatchId || sourceBatchId === targetBatchId) {
    return NextResponse.json({ error: "two different batches are required" }, { status: 400 });
  }

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [sourceBatch, targetBatch] = await Promise.all([
    prisma.batch.findUnique({ where: { id: sourceBatchId } }),
    prisma.batch.findUnique({ where: { id: targetBatchId } }),
  ]);
  if (!sourceBatch || !coordinatorIds.includes(sourceBatch.coordinatorId)) return NextResponse.json({ error: "source batch not found" }, { status: 404 });
  if (!targetBatch || !coordinatorIds.includes(targetBatch.coordinatorId)) return NextResponse.json({ error: "target batch not found" }, { status: 404 });

  const [sourceCourses, targetCourses, sourcePlos, targetPlos] = await Promise.all([
    prisma.course.findMany({ where: { batchId: sourceBatchId }, include: { ploMappings: { include: { plo: true } } } }),
    prisma.course.findMany({ where: { batchId: targetBatchId }, include: { ploMappings: true } }),
    prisma.pLO.findMany({ where: { batchId: sourceBatchId } }),
    prisma.pLO.findMany({ where: { batchId: targetBatchId } }),
  ]);

  const targetCourseByCode = new Map(targetCourses.map((c) => [c.code, c]));
  const targetPloByNumber = new Map(targetPlos.map((p) => [p.number, p]));

  let copiedCount = 0, skippedNoMatch = 0;
  for (const sc of sourceCourses) {
    const tc = targetCourseByCode.get(sc.code);
    if (!tc) { skippedNoMatch += sc.ploMappings.length; continue; }
    const existingTargetPloIds = new Set(tc.ploMappings.map((m) => m.ploId));

    for (const mapping of sc.ploMappings) {
      const targetPlo = targetPloByNumber.get(mapping.plo.number);
      if (!targetPlo) { skippedNoMatch++; continue; }
      if (existingTargetPloIds.has(targetPlo.id)) continue; // already set — don't overwrite

      await prisma.coursePloMapping.create({ data: { courseId: tc.id, ploId: targetPlo.id, assignedById: user.id } });
      copiedCount++;
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "PLO_MAPPINGS_COPIED", entityType: "Batch", entityId: targetBatchId, metadata: { sourceBatchId, copiedCount, skippedNoMatch } });

  return NextResponse.json({ copiedCount, skippedNoMatch });
}
