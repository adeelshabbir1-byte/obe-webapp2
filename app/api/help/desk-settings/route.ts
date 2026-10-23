import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { whoIs, rdb, staffOf, str } from "../../../../lib/registers";
import { deskSetting, DESK_HINT, DEFAULT_SLA } from "../../../../lib/help/deskExtra";

/** POST (the Institute Head) { action: "addSupport" | "removeSupport", userId } | { action: "sla", URGENT, HIGH, NORMAL, LOW } */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !w.head) return NextResponse.json({ error: "Only the Institute Head sets up the help desk." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cur = await deskSetting(w.chairmanId);
  let ids = cur.supportUserIds, sla = cur.sla;
  if (b.action === "addSupport" || b.action === "removeSupport") {
    const id = str(b.userId);
    if (b.action === "addSupport") {
      if (!(await staffOf(w.chairmanId)).some((s) => s.id === id)) return NextResponse.json({ error: "Choose a member of staff." }, { status: 400 });
      ids = Array.from(new Set([...ids, id])).slice(0, 10);
    } else ids = ids.filter((x) => x !== id);
  } else if (b.action === "sla") {
    sla = Object.fromEntries(Object.keys(DEFAULT_SLA).map((k) => [k, Math.max(1, Math.min(720, Math.round(Number(b[k]) || cur.sla[k])))]));
  } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    await rdb.helpDeskSetting.upsert({ where: { chairmanId: w.chairmanId }, create: { chairmanId: w.chairmanId, supportUserIds: JSON.stringify(ids), slaHoursJson: JSON.stringify(sla), updatedById: user.id }, update: { supportUserIds: JSON.stringify(ids), slaHoursJson: JSON.stringify(sla), updatedById: user.id, updatedAt: new Date() } });
  } catch { return NextResponse.json({ error: DESK_HINT }, { status: 500 }); }
  await writeAuditLog({ actorUserId: user.id, action: "HELP_DESK_SETTINGS_SAVED", entityType: "HelpDeskSetting", entityId: w.chairmanId, metadata: { support: ids.length } });
  return NextResponse.json({ ok: true });
}
