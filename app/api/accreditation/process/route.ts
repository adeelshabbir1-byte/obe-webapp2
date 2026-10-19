import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { govScope, inScope } from "../../../../lib/accreditation/governance";
import { flowOf, saveStep, FLOW_HINT } from "../../../../lib/accreditation/processFlow";

// POST { cycleId, key, status, doneOn?, expectedOn?, note? } — the cycle's managers and its Program Lead.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const s = user ? await govScope(user) : null;
  const b = await req.json().catch(() => ({}));
  const c = await prisma.accreditationCycle.findUnique({ where: { id: String(b.cycleId || "") } }).catch(() => null);
  if (!user || !s || !c || !inScope(s, c) || !(s.canManage || c.leadId === user.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(flowOf(c.body) || []).some((x) => x.key === b.key)) return NextResponse.json({ error: "unknown step" }, { status: 400 });
  try { await saveStep(c.id, String(b.key), { status: String(b.status || "PENDING"), doneOn: b.doneOn ? String(b.doneOn) : null, expectedOn: b.expectedOn ? String(b.expectedOn) : null, note: b.note ? String(b.note).slice(0, 500) : null }, user.id); }
  catch { return NextResponse.json({ error: FLOW_HINT }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
