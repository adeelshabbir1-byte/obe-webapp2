import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { deptScope } from "../../../../lib/omcScope";
import { wdb } from "../../../../lib/ploWeights";
import { checkWeights } from "../../../../lib/ploWeightMath";

// PUT { ploId, weights: { courseId: pct }, source } — the OMC saves how much each course counts toward one PLO.
// DELETE ?ploId= — back to the equal split.
async function guard(ploId: string) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "OMC") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const plo = await prisma.pLO.findUnique({ where: { id: ploId }, select: { id: true, number: true, batchId: true, coordinator: { select: { managedById: true, departmentId: true } } } });
  const scope = deptScope(user);
  if (!plo || plo.coordinator.managedById !== user.managedById || (scope.departmentId && plo.coordinator.departmentId !== scope.departmentId)) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  return { user, plo };
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const g = await guard(String(b.ploId || ""));
  if ("error" in g) return g.error;
  const { user, plo } = g;
  const courseIds = (await prisma.coursePloMapping.findMany({ where: { ploId: plo.id }, select: { courseId: true } })).map((m) => m.courseId);
  const weights: Record<string, number> = {};
  for (const id of courseIds) if (b.weights && b.weights[id] !== undefined) weights[id] = Math.round(Number(b.weights[id]) * 100) / 100;
  const bad = checkWeights(courseIds, weights);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const source = ["MANUAL", "SUGGESTED", "EQUAL"].includes(b.source) ? b.source : "MANUAL";
  try {
    await wdb.coursePloWeight.deleteMany({ where: { ploId: plo.id, courseId: { notIn: courseIds } } });
    for (const id of courseIds) {
      await wdb.coursePloWeight.upsert({
        where: { courseId_ploId: { courseId: id, ploId: plo.id } },
        update: { weightPct: weights[id], source, updatedById: user.id },
        create: { batchId: plo.batchId, ploId: plo.id, courseId: id, weightPct: weights[id], source, updatedById: user.id },
      });
    }
  } catch {
    return NextResponse.json({ error: "The GA weight table is not in the database yet — run prisma/migration_plo_weights.sql (or the System Health fix script) in Supabase." }, { status: 500 });
  }
  await writeAuditLog({ actorUserId: user.id, action: "PLO_WEIGHTS_SET", entityType: "PLO", entityId: plo.id, metadata: { ploNumber: plo.number, source, weights: JSON.stringify(weights) } });
  revalidateTag("outcome-flow");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req.nextUrl.searchParams.get("ploId") || "");
  if ("error" in g) return g.error;
  try { await wdb.coursePloWeight.deleteMany({ where: { ploId: g.plo.id } }); } catch { /* table missing: nothing saved */ }
  await writeAuditLog({ actorUserId: g.user.id, action: "PLO_WEIGHTS_RESET", entityType: "PLO", entityId: g.plo.id, metadata: { ploNumber: g.plo.number } });
  revalidateTag("outcome-flow");
  return NextResponse.json({ ok: true });
}
