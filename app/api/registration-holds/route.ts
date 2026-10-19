import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { decideHold, choicesFor } from "../../../lib/autoRegister";
import { writeAuditLog } from "../../../lib/audit";

const adb = prisma as unknown as Record<string, any>;

// POST { holdId, courseIds[], note } — the batch advisor (or the Program Lead) registers a held student.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const h = await adb.registrationHold.findUnique({ where: { id: String(b.holdId || "") } }).catch(() => null);
  if (!h) return NextResponse.json({ error: "not found" }, { status: 404 });
  const batch = await prisma.batch.findUnique({ where: { id: h.batchId }, select: { advisorId: true, coordinatorId: true } });
  if (!batch || (batch.advisorId !== user.id && batch.coordinatorId !== user.id)) return NextResponse.json({ error: "Only the batch advisor or Program Lead decides." }, { status: 403 });
  const allowed = await choicesFor(h.studentId, h.batchId);
  const ok = new Set([...allowed.own, ...allowed.repeats].map((c) => c.id));
  const ids: string[] = Array.isArray(b.courseIds) ? b.courseIds.map(String).filter((x: string) => ok.has(x)) : [];
  await decideHold(h.id, ids, user, b.note ? String(b.note).slice(0, 500) : null);
  await writeAuditLog({ actorUserId: user.id, action: "REGISTRATION_HOLD_DECIDED", entityType: "Student", entityId: h.studentId, metadata: { courses: ids.length } });
  return NextResponse.json({ ok: true });
}
