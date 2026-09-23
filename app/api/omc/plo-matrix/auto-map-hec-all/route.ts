import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// Same as auto-map-hec, but for every batch across the whole
// institution at once, a handful at a time per call — with 40+ batches,
// doing every one of them (each its own set of queries) in a single
// request risks the same kind of timeout content-sync's "sync all" ran
// into, so the caller is expected to call this repeatedly (via
// nextOffset) until done, same pattern.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const offset = Math.max(Number(body.offset) || 0, 0);
  const pageSize = Math.min(Math.max(Number(body.pageSize) || 5, 1), 20);

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" }, select: { id: true } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: { id: "asc" } });
  const pageOfBatches = allBatches.slice(offset, offset + pageSize);

  let totalCreated = 0, totalAlreadyMapped = 0, totalSkippedNoPlo = 0, totalSkippedNoSuggestion = 0;
  const batchesProcessed: string[] = [];

  for (const batch of pageOfBatches) {
    const [courses, plos] = await Promise.all([
      prisma.course.findMany({ where: { batchId: batch.id } }),
      prisma.pLO.findMany({ where: { batchId: batch.id } }),
    ]);
    const ploByNumber = new Map(plos.map((p) => [p.number, p]));

    // Same real-FK-chain derivation as auto-map-hec/route.ts — see the
    // comment there for why this replaced the old code-matched table.
    const masterCourseIds = Array.from(new Set(courses.map((c) => c.masterCourseId).filter((id): id is string => !!id)));
    const hecClos = masterCourseIds.length > 0
      ? await prisma.masterCourseClo.findMany({
          where: { masterCourseId: { in: masterCourseIds }, ploMappingSource: "HEC", mappedPloId: { not: null } },
          include: { mappedPlo: { select: { number: true } } },
        })
      : [];
    const ploNumbersByMasterCourseId = new Map<string, Set<number>>();
    for (const clo of hecClos) {
      if (!clo.mappedPlo) continue;
      if (!ploNumbersByMasterCourseId.has(clo.masterCourseId)) ploNumbersByMasterCourseId.set(clo.masterCourseId, new Set());
      ploNumbersByMasterCourseId.get(clo.masterCourseId)!.add(clo.mappedPlo.number);
    }

    for (const course of courses) {
      const ploNumbers = course.masterCourseId ? ploNumbersByMasterCourseId.get(course.masterCourseId) : undefined;
      if (!ploNumbers || ploNumbers.size === 0) { totalSkippedNoSuggestion++; continue; }
      for (const num of ploNumbers) {
        const plo = ploByNumber.get(num);
        if (!plo) { totalSkippedNoPlo++; continue; }
        const existing = await prisma.coursePloMapping.findUnique({ where: { courseId_ploId: { courseId: course.id, ploId: plo.id } } });
        if (existing) { totalAlreadyMapped++; continue; }
        await prisma.coursePloMapping.create({ data: { courseId: course.id, ploId: plo.id, assignedById: user.id } });
        totalCreated++;
      }
    }
    batchesProcessed.push(`${batch.degreeProgram} — ${batch.batchName}`);
  }

  await writeAuditLog({ actorUserId: user.id, action: "PLO_MAPPING_AUTO_MAPPED_HEC_ALL_BATCHES", entityType: "Batch", entityId: "bulk", metadata: { offset, created: totalCreated } });

  const nextOffset = offset + pageOfBatches.length;
  return NextResponse.json({
    created: totalCreated, alreadyMapped: totalAlreadyMapped, skippedNoPlo: totalSkippedNoPlo, skippedNoSuggestion: totalSkippedNoSuggestion,
    batchesProcessed, totalBatches: allBatches.length, nextOffset, done: nextOffset >= allBatches.length,
  });
}
