import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { setDuty, DUTIES } from "../../../../lib/duties";

export const dynamic = "force-dynamic";

// POST { duty: "EXAM_CONTROLLER" | "QEC_INCHARGE", userId, revoke? } — the Institute Head gives or takes an institute duty.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head gives institute duties." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const duty = String(b.duty || "");
  if (!DUTIES[duty]) return NextResponse.json({ error: "Unknown duty." }, { status: 400 });
  try {
    await setDuty(user.id, duty, String(b.userId || ""), !b.revoke);
    await writeAuditLog({ actorUserId: user.id, action: b.revoke ? "DUTY_REMOVED" : "DUTY_GIVEN", entityType: "User", entityId: String(b.userId || ""), metadata: { duty } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
