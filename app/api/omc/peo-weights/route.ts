import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { deptScope } from "../../../../lib/omcScope";
import { wdb } from "../../../../lib/ploWeights";
import { peosOf } from "../../../../lib/outcomeFlow";

// PUT { batchId, peoIndex, weights: { [ploNumber]: pct } } — the OMC sets which PLOs serve a PEO of the batch's
// program and how much each counts (total 100). An empty set clears the PEO. Applies to every batch of the program.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const batch = await prisma.batch.findUnique({ where: { id: String(b.batchId || "") }, select: { coordinatorId: true, degreeProgram: true, coordinator: { select: { managedById: true, departmentId: true } } } });
  const scope = deptScope(user);
  if (!batch || batch.coordinator.managedById !== user.managedById || (scope.departmentId && batch.coordinator.departmentId !== scope.departmentId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const peos = await peosOf(batch.coordinatorId, batch.degreeProgram);
  const peoIndex = Number(b.peoIndex);
  if (!Number.isInteger(peoIndex) || peoIndex < 0 || peoIndex >= peos.length) return NextResponse.json({ error: "Unknown PEO." }, { status: 400 });
  const entries = Object.entries((b.weights || {}) as Record<string, unknown>).map(([k, v]) => [parseInt(k, 10), Math.round(Number(v) * 100) / 100] as const).filter(([n, w]) => Number.isInteger(n) && n > 0 && w > 0);
  if (entries.some(([, w]) => !Number.isFinite(w))) return NextResponse.json({ error: "Weights must be numbers." }, { status: 400 });
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (entries.length && Math.abs(total - 100) > 0.05) return NextResponse.json({ error: `Weights add up to ${Math.round(total * 100) / 100}% — they must total 100%.` }, { status: 400 });
  try {
    await wdb.programPeoWeight.deleteMany({ where: { coordinatorId: batch.coordinatorId, degreeProgram: batch.degreeProgram, peoIndex } });
    if (entries.length) await wdb.programPeoWeight.createMany({ data: entries.map(([ploNumber, weightPct]) => ({ coordinatorId: batch.coordinatorId, degreeProgram: batch.degreeProgram, peoIndex, ploNumber, weightPct, updatedById: user.id })) });
  } catch {
    return NextResponse.json({ error: "The outcome weight tables are not in the database yet — run prisma/migration_plo_weights.sql (or the System Health fix script) in Supabase." }, { status: 500 });
  }
  await writeAuditLog({ actorUserId: user.id, action: "PEO_WEIGHTS_SET", entityType: "ProgramProfile", entityId: `${batch.coordinatorId}:${batch.degreeProgram}`, metadata: { peoIndex, weights: JSON.stringify(Object.fromEntries(entries)) } });
  revalidateTag("outcome-flow");
  return NextResponse.json({ ok: true });
}
