import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { suggestPloForClo, evenSplitContribution } from "../../../../../lib/cloPloMatching";
import { ensureCoursePloMapping } from "../../../../../lib/coursePloSync";

// Keyword-based CLO-to-PLO suggestion, at the granularity that
// actually drives weighted attainment scoring (unlike the existing
// Course-level auto-map tools, which only fill a coarser course<->PLO
// matrix and never touch this field at all). Deliberately the same
// cautious posture as those tools: only fills gaps, tags everything it
// touches as ploMappingSource "SYSTEM" so it's visually distinct from
// a Subject Expert's own deliberate choice, and a human reviews the
// result afterward rather than this being treated as final.
//
// Chunked per the lesson learned earlier this session with
// copy-from-batch: a batch with many courses, each with several CLOs,
// each needing comparison against every PLO, can add up -- the client
// calls this repeatedly with an increasing cursor until every course
// in the batch has been processed.
const CHUNK_SIZE = 15;

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
  const cursor: string | undefined = typeof body.cursor === "string" ? body.cursor : undefined;

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const plos = await prisma.pLO.findMany({ where: { batchId: batch.id } });
  if (plos.length === 0) {
    return NextResponse.json({ error: "This batch has no PLOs defined yet — nothing to map against." }, { status: 400 });
  }
  const ploCandidates = plos.map((p) => ({ id: p.id, statement: `${p.title} ${p.description}` }));

  const courses = await prisma.course.findMany({
    where: { batchId: batch.id, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: "asc" },
    take: CHUNK_SIZE,
    include: { clos: { where: { source: "SE" } } },
  });

  let suggested = 0, skippedNoConfidentMatch = 0, alreadyMapped = 0;

  for (const course of courses) {
    const alreadyMappedClos = course.clos.filter((c) => c.mappedPloId);
    const unmappedClos = course.clos.filter((c) => !c.mappedPloId);
    alreadyMapped += alreadyMappedClos.length;

    // What this CLO would map to, if anything -- computed for every
    // unmapped CLO in this course before writing any of them, so the
    // even-split-per-PLO grouping below has the complete picture
    // (freshly suggested CLOs sharing a PLO with each other, or with
    // an already-mapped CLO in the same course).
    const suggestions = new Map<string, string>(); // cloId -> ploId
    for (const clo of unmappedClos) {
      const match = suggestPloForClo(clo.statement, ploCandidates);
      if (match) suggestions.set(clo.id, match.ploId);
      else skippedNoConfidentMatch++;
    }
    if (suggestions.size === 0) continue;

    // Group every CLO (already-mapped + newly-suggested) in this
    // course by its PLO, so contribution percentages are recomputed
    // as an even split that still sums to exactly 100 per PLO,
    // per the CLO model's own constraint.
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
          : { ploContributionPct: u.pct }, // re-balance an existing mapping's % only; never touch its source or which PLO it points to
      }))
    );
    suggested += updates.filter((u) => u.isNew).length;

    // Propagate every newly-mapped CLO up into the coarser
    // Course<->PLO Matrix, so it shows this course as contributing to
    // that PLO there too, not just in the CLO editor.
    const newPloIdsForCourse = new Set(updates.filter((u) => u.isNew).map((u) => u.ploId));
    for (const ploId of newPloIdsForCourse) await ensureCoursePloMapping(course.id, ploId, user.id, "SYSTEM");
  }

  const nextCursor = courses.length > 0 ? courses[courses.length - 1].id : undefined;
  const mightHaveMore = courses.length === CHUNK_SIZE;

  await writeAuditLog({
    actorUserId: user.id, action: "CLO_PLO_AUTO_MAPPED_SYSTEM", entityType: "Batch", entityId: batch.id,
    metadata: { suggested, skippedNoConfidentMatch, alreadyMapped },
  });

  return NextResponse.json({ suggested, skippedNoConfidentMatch, alreadyMapped, nextCursor, mightHaveMore });
}
