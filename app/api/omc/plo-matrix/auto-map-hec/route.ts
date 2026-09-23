import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const [courses, plos] = await Promise.all([
    prisma.course.findMany({ where: { batchId: batch.id } }),
    prisma.pLO.findMany({ where: { batchId: batch.id } }),
  ]);
  const ploByNumber = new Map(plos.map((p) => [p.number, p]));

  // Derive suggestions from the HEC document's own CLO-level PLO tags
  // (MasterCourseClo.mappedPloId, where ploMappingSource = "HEC") via
  // each course's real masterCourseId link — not a separate, code-
  // matched suggestion table, which is fragile against code-format
  // drift (this curriculum's codes don't match HEC's own numbering).
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

  let created = 0, skippedNoPlo = 0, skippedNoSuggestion = 0, alreadyMapped = 0;

  for (const course of courses) {
    const ploNumbers = course.masterCourseId ? ploNumbersByMasterCourseId.get(course.masterCourseId) : undefined;
    if (!ploNumbers || ploNumbers.size === 0) { skippedNoSuggestion++; continue; }

    for (const num of ploNumbers) {
      const plo = ploByNumber.get(num);
      if (!plo) { skippedNoPlo++; continue; }

      const existing = await prisma.coursePloMapping.findUnique({ where: { courseId_ploId: { courseId: course.id, ploId: plo.id } } });
      if (existing) { alreadyMapped++; continue; }

      await prisma.coursePloMapping.create({ data: { courseId: course.id, ploId: plo.id, assignedById: user.id } });
      created++;
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "PLO_MAPPING_AUTO_MAPPED_HEC", entityType: "Batch", entityId: batch.id, metadata: { created, alreadyMapped, skippedNoPlo, skippedNoSuggestion } });

  return NextResponse.json({ created, alreadyMapped, skippedNoPlo, skippedNoSuggestion });
}
