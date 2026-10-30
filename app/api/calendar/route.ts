import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { chairmanIdFor } from "../../../lib/reportScope";
import { staffOf } from "../../../lib/registers";
import { toMin } from "../../../lib/calendarCore";
import { asProvider, unlink } from "../../../lib/calendarLink";
import { addBlock, cancelAppointment, deleteBlock, requestAppointment, respond, saveSettings } from "../../../lib/teacherCalendar";

/**
 * POST { action, ... } — a member of staff's own calendar, and booking a colleague.
 *   settings { slotMinutes, maxPerDay, start, end, days, classPrivacy, counsellingPrivacy, open }
 *   addBlock { repeat: "WEEKLY"|"ONCE", dayOfWeek, date, start, end, label, privacy }   deleteBlock { id }
 *   respond { id, accept, note }   cancel { id }   request { teacherId, startsAt, reason }   unlink { provider }
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "settings": {
        const start = toMin(b.start), end = toMin(b.end);
        const boxes = [0, 1, 2, 3, 4, 5, 6].filter((i) => `d${i}` in b);
        const days = boxes.length ? boxes.filter((i) => b[`d${i}`] === true) : Array.isArray(b.days) ? b.days : undefined;
        await saveSettings(user.id, { slotMinutes: Number(b.slotMinutes), maxPerDay: b.maxPerDay === undefined ? undefined : Number(b.maxPerDay), startMin: start ?? undefined, endMin: end ?? undefined, days, classPrivacy: b.classPrivacy, counsellingPrivacy: b.counsellingPrivacy, open: b.open === undefined ? undefined : b.open === true || b.open === "true" });
        return NextResponse.json({ ok: true });
      }
      case "addBlock": {
        const start = toMin(b.start), end = toMin(b.end);
        if (start === null || end === null) return NextResponse.json({ error: "Choose the start and end times." }, { status: 400 });
        const once = b.repeat === "ONCE";
        await addBlock(user.id, { dayOfWeek: once ? null : Number(b.dayOfWeek), date: once ? String(b.date || "") : null, startMin: start, endMin: end, label: String(b.label || ""), privacy: b.privacy === "DETAILS" ? "DETAILS" : "BUSY" });
        return NextResponse.json({ ok: true });
      }
      case "deleteBlock": await deleteBlock(user.id, String(b.id || "")); return NextResponse.json({ ok: true });
      case "respond": await respond(String(b.id || ""), user.id, b.accept === true || b.accept === "true", b.note ? String(b.note) : null); return NextResponse.json({ ok: true });
      case "cancel": await cancelAppointment(String(b.id || ""), { id: user.id }); return NextResponse.json({ ok: true });
      case "request": {
        const chairmanId = await chairmanIdFor(user as never).catch(() => "");
        const teacherId = String(b.teacherId || "");
        if (!chairmanId || !(await staffOf(chairmanId)).some((s) => s.id === teacherId)) return NextResponse.json({ error: "Choose a colleague from your institute." }, { status: 400 });
        await requestAppointment(teacherId, { kind: "STAFF", id: user.id, name: user.name, chairmanId }, String(b.startsAt || ""), String(b.reason || ""));
        return NextResponse.json({ ok: true });
      }
      case "unlink": { const p = asProvider(String(b.provider || "")); if (p) await unlink(user.id, p); return NextResponse.json({ ok: true }); }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
