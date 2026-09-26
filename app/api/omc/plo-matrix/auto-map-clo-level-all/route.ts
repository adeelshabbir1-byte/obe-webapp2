import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { suggestPloForClo, evenSplitContribution } from "../../../../../lib/cloPloMatching";
import { ensureCoursePloMapping } from "../../../../../lib/coursePloSync";

// All-batches counterpart to auto-map-clo-level, same offset/pageSize
// pattern as auto-map-system-all. A smaller default pageSize than that
// one (2 rather than 5) since this does real per-CLO keyword
// comparison work plus a DB transaction per course, not just a single
// lookup+create per course — heavier per batch, so fewer batches per
// call keeps this comfortably under the same timeout risk.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const offset = Math.max(Number(body.offset) || 0, 0);
  const pageSize = Math.min(Math.max(Number(body.pageSize) || 2, 1), 10);

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" }, select: { id: true } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: { id: "asc" } });
  const pageOfBatches = allBatches.slice(offset, offset + pageSize);

  let totalSuggested = 0, totalSkippedNoConfidentMatch = 0, totalAlreadyMapped = 0;
  const batchesProcessed: string[] = [];
  const batchesSkippedNoPlos: string[] = [];

  for (const batch of pageOfBatches) {
    const plos = await prisma.pLO.findMany({ where: { batchId: batch.id } });
    if (plos.length === 0) { batchesSkippedNoPlos.push(`${batch.degreeProgram} — ${batch.batchName}`); continue; }
    const ploCandidates = plos.map((p) => ({ id: p.id, statement: `${p.title} ${p.description}` }));

    const courses = await prisma.course.findMany({
      where: { batchId: batch.id },
      include: { clos: { where: { source: "SE" } } },
    });

    for (const course of courses) {
      const alreadyMappedClos = course.clos.filter((c) => c.mappedPloId);
      const unmappedClos = course.clos.filter((c) => !c.mappedPloId);
      totalAlreadyMapped += alreadyMappedClos.length;

      const suggestions = new Map<string, string>();
      for (const clo of unmappedClos) {
        const match = suggestPloForClo(clo.statement, ploCandidates);
        if (match) suggestions.set(clo.id, match.ploId);
        else totalSkippedNoConfidentMatch++;
      }
      if (suggestions.size === 0) continue;

      const byPlo = new Map<string, { id: string; wasAlreadyMapped: boolean }[]>();
      for (const clo of alreadyMappedClos) {
        const ploId = clo.mappedPloId!;
        if (!byPlo.has(ploId)) byPlo.set(ploId, []);
        byPlo.get(ploId)!.push({ id: clo.id, wasAlreadyMapped: true });
      }
      for (const [cloId, ploId] of suggestions) {
        if (!byPlo.has(ploId)) byPlo.set(ploId, []);
        byPlo.get(ploId)!.push({ id: cloId, wasAlreadyMapped: false });
      }

      const updates: { cloId: string; ploId: string; pct: number; isNew: boolean }[] = [];
      for (const [ploId, members] of byPlo) {
        members.forEach((m, i) => updates.push({ cloId: m.id, ploId, pct: evenSplitContribution(members.length, i), isNew: !m.wasAlreadyMapped }));
      }

      await prisma.$transaction(
        updates.map((u) => prisma.cLO.update({
          where: { id: u.cloId },
          data: u.isNew
            ? { mappedPloId: u.ploId, ploContributionPct: u.pct, ploMappingSource: "SYSTEM" }
            : { ploContributionPct: u.pct },
        }))
      );
      totalSuggested += updates.filter((u) => u.isNew).length;

      const newPloIdsForCourse = new Set(updates.filter((u) => u.isNew).map((u) => u.ploId));
      for (const ploId of newPloIdsForCourse) await ensureCoursePloMapping(course.id, ploId, user.id);
    }
    batchesProcessed.push(`${batch.degreeProgram} — ${batch.batchName}`);
  }

  await writeAuditLog({
    actorUserId: user.id, action: "CLO_PLO_AUTO_MAPPED_SYSTEM_ALL_BATCHES", entityType: "Batch", entityId: "bulk",
    metadata: { offset, suggested: totalSuggested },
  });

  const nextOffset = offset + pageOfBatches.length;
  return NextResponse.json({
    suggested: totalSuggested, skippedNoConfidentMatch: totalSkippedNoConfidentMatch, alreadyMapped: totalAlreadyMapped,
    batchesProcessed, batchesSkippedNoPlos, totalBatches: allBatches.length, nextOffset, done: nextOffset >= allBatches.length,
  });
}
