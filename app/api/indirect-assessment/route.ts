import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { idb, SOURCES } from "../../../lib/indirectPlo";

// The Program Lead (or Institute Head / OMC) sets how direct and indirect evidence are blended for a program, and the target.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const where = await reviewBatchWhere(user);
  if (!where || !["CHAIRMAN", "OMC", "PROGRAM_COORDINATOR"].includes(user.role)) return NextResponse.json({ error: "Only the Program Lead, OMC or Institute Head set the weights." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const batch = await prisma.batch.findFirst({ where: { id: String(b.batchId || ""), ...where }, select: { coordinatorId: true } });
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  const w: Record<string, number> = {};
  for (const [k] of SOURCES) w[k] = Math.max(0, Math.min(100, Number(b[k]) || 0));
  if (!Object.values(w).some((x) => x > 0)) return NextResponse.json({ error: "At least one weight must be above zero." }, { status: 400 });
  const target = Math.max(1, Math.min(100, Number(b.target) || 60));
  try {
    await idb.indirectConfig.upsert({ where: { coordinatorId: batch.coordinatorId }, create: { coordinatorId: batch.coordinatorId, weightsJson: JSON.stringify(w), target }, update: { weightsJson: JSON.stringify(w), target } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Run prisma/migration_indirect.sql first." }, { status: 500 }); }
}
