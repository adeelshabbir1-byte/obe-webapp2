import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { coordinatorIdsFor } from "../../../../lib/reportScope";
import { FLOW_VIEW_ROLES } from "../../../../lib/outcomeFlow";
import { backfillPloChanges } from "../../../../lib/ploDelta";

export const maxDuration = 60;

// POST { batchId } — fills the PLO change log from the batch's already-approved course results.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !FLOW_VIEW_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const batch = await prisma.batch.findUnique({ where: { id: String(b.batchId || "") }, select: { id: true, coordinatorId: true } });
  if (!batch || !(await coordinatorIdsFor(user)).includes(batch.coordinatorId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try { return NextResponse.json({ ok: true, courses: await backfillPloChanges(batch.id) }); }
  catch { return NextResponse.json({ error: "The PLO change log is not set up yet — run prisma/migration_plo_change_log.sql." }, { status: 500 }); }
}
