import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { writeAuditLog } from "../../../lib/audit";
import { idb, WATCHERS, teamOf, checkBoss } from "../../../lib/inactivity";

// PUT { workingDays, exemptIds, offDays? } — a boss sets their sign-in limit (0 = no alerts) and who is left out.
// The Institute Head's row is the institute default and also sets the weekly days off.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !WATCHERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "No institute on record for your account." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const workingDays = Math.max(0, Math.min(30, Math.round(Number(b.workingDays))));
  if (!Number.isFinite(workingDays)) return NextResponse.json({ error: "Give the number of working days." }, { status: 400 });
  const team = new Set((await teamOf(user, chairmanId, true)).map((m) => m.id));
  const exemptIds = (Array.isArray(b.exemptIds) ? b.exemptIds : []).map(String).filter((id: string) => team.has(id)).slice(0, 500);
  const data: Record<string, unknown> = { workingDays, exemptIds };
  if (user.role === "CHAIRMAN" && Array.isArray(b.offDays)) {
    const off = Array.from(new Set(b.offDays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))) as number[];
    if (off.length > 3) return NextResponse.json({ error: "At most three days off a week." }, { status: 400 });
    data.offDaysJson = JSON.stringify(off.sort());
  }
  try {
    await idb.inactivityPolicy.upsert({ where: { bossId: user.id }, update: data, create: { chairmanId, bossId: user.id, ...data } });
  } catch {
    return NextResponse.json({ error: "The sign-in watch tables are not in the database yet — run prisma/migration_inactivity.sql in Supabase." }, { status: 500 });
  }
  await writeAuditLog({ actorUserId: user.id, action: "INACTIVITY_POLICY_SET", entityType: "User", entityId: user.id, metadata: { workingDays, exempt: exemptIds.length } });
  return NextResponse.json({ ok: true });
}

// POST — check my team now (the daily run does the same for everyone) and send any alerts that are due.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !WATCHERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "No institute on record for your account." }, { status: 400 });
  const sent = await checkBoss(user, chairmanId);
  return NextResponse.json({ ok: true, sent });
}
