import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { chairmanIdFor } from "../../../lib/reportScope";
import { addEvent, classSlots, decideRequest, forceMajeure, requestMove } from "../../../lib/resched";
import { freeSlots, rankSlots } from "../../../lib/reschedCore";

/**
 * POST { action, ... }
 *   slots { batchIds, days, from, to, length, rank }   request { entryId, fromDate, toDate, toStart, reason, eventId }
 *   decide { id, ok, note }   event { title, date, start, end, batchIds }   closure { date, reason }
 */
const toH = (s: unknown) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) + Number(m[2]) / 60 : Number(s); };
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const batchIds = Array.isArray(b.batchIds) ? b.batchIds.map(String) : String(b.batchIds || "").split(",").filter(Boolean);
  try {
    switch (b.action) {
      case "slots": {
        const slots = await classSlots(chairmanId);
        const o = { days: Array.isArray(b.days) && b.days.length ? b.days : undefined, from: b.from ? toH(b.from) : undefined, to: b.to ? toH(b.to) : undefined, length: Number(b.length) || 1 };
        const list = b.rank ? rankSlots(slots, batchIds, o).slice(0, 15) : freeSlots(slots, batchIds, o);
        return NextResponse.json({ ok: true, slots: list.map((s) => ({ day: s.day, start: s.start, end: s.end, affected: s.affected.map((a) => a.code) })) });
      }
      case "request": return NextResponse.json({ ok: true, id: await requestMove(user, chairmanId, { entryId: String(b.entryId || ""), fromDate: String(b.fromDate || ""), toDate: String(b.toDate || ""), toStart: toH(b.toStart), reason: String(b.reason || ""), eventId: b.eventId || null }), message: "Sent to the Chairman / Dean." });
      case "decide": return NextResponse.json({ ok: true, message: await decideRequest(user, chairmanId, String(b.id || ""), b.ok === true || b.ok === "true", String(b.note || "")) });
      case "event": await addEvent(user, chairmanId, { title: String(b.title || ""), date: String(b.date || ""), start: toH(b.start), end: toH(b.end), batchIds }); return NextResponse.json({ ok: true });
      case "closure": { const r = await forceMajeure(user, chairmanId, String(b.date || ""), String(b.reason || "")); return NextResponse.json({ ok: true, message: `${r.plan.length} class(es) moved to make-up slots${r.unplaced.length ? `; no slot found for ${r.unplaced.join(", ")}` : ""}.` }); }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
