import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, staffOf, str, dateOrNull } from "../../../lib/registers";
import { cdb, COUNSEL_HINT, MODES, counsels, publishSlots, callIn, schedule, cancel, complete } from "../../../lib/counselling";

/**
 * POST { action, ... } — for batch advisors and student counsellors (designate: the Institute Head or Student Affairs).
 *   publish { firstDate, time, minutes, count, weeks, mode, place }   deleteSlot { id }   byRequest { on }
 *   callIn { studentId, kind, reason, source }   schedule { bookingId, startsAt, mode, place }   cancel { bookingId, note }
 *   complete { bookingId, held, kind, notes, followUp }   designate { userId, on }
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const me = { id: user.id, name: user.name };
  try {
    if (b.action === "designate") {
      if (!(w.head || w.affairs)) return NextResponse.json({ error: "Only the Institute Head or Student Affairs designates counsellors." }, { status: 403 });
      const id = str(b.userId);
      if (!(await staffOf(w.chairmanId)).some((s) => s.id === id)) return NextResponse.json({ error: "Choose a member of staff." }, { status: 400 });
      const on = b.on !== false && b.on !== "false";
      await cdb.counsellorProfile.upsert({ where: { userId: id }, create: { userId: id, chairmanId: w.chairmanId, isCounsellor: on, designatedById: user.id }, update: { isCounsellor: on, designatedById: user.id, updatedAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: on ? "COUNSELLOR_DESIGNATED" : "COUNSELLOR_REMOVED", entityType: "User", entityId: id, metadata: {} });
      return NextResponse.json({ ok: true });
    }
    if (!(await counsels(user.id, w.chairmanId))) return NextResponse.json({ error: "Only batch advisors and student counsellors use counselling." }, { status: 403 });
    switch (b.action) {
      case "publish": {
        const first = dateOrNull(b.firstDate);
        if (!first) return NextResponse.json({ error: "Choose the first day." }, { status: 400 });
        const n = await publishSlots(user.id, w.chairmanId, { firstDate: first, time: str(b.time) || "10:00", minutes: Math.max(15, Math.min(120, Number(b.minutes) || 30)), count: Math.max(1, Number(b.count) || 1), weeks: Math.max(1, Number(b.weeks) || 4), mode: MODES[str(b.mode)] ? str(b.mode) : "IN_PERSON", place: str(b.place, 300) || null });
        return NextResponse.json({ ok: true, added: n });
      }
      case "deleteSlot": {
        const s = await cdb.counsellingSlot.findUnique({ where: { id: str(b.id) } });
        if (!s || s.counsellorId !== user.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
        if (await cdb.counsellingBooking.count({ where: { slotId: s.id, status: { in: ["BOOKED", "DONE"] } } })) return NextResponse.json({ error: "Someone has booked this time — cancel the booking instead." }, { status: 400 });
        await cdb.counsellingSlot.delete({ where: { id: s.id } });
        return NextResponse.json({ ok: true });
      }
      case "byRequest": {
        const on = b.on === true || b.on === "true";
        await cdb.counsellorProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, chairmanId: w.chairmanId, byRequest: on }, update: { byRequest: on, updatedAt: new Date() } });
        return NextResponse.json({ ok: true });
      }
      case "callIn": {
        let sid = str(b.studentId);
        if (!sid && str(b.rollNumber)) sid = (await prisma.student.findFirst({ where: { rollNumber: { equals: str(b.rollNumber), mode: "insensitive" }, batch: { coordinator: { managedById: w.chairmanId } } }, select: { id: true } }))?.id || "";
        if (!sid) return NextResponse.json({ error: "Choose the student (or type the roll number)." }, { status: 400 });
        await callIn(me, sid, str(b.kind), str(b.reason || b.note, 500), str(b.source));
        return NextResponse.json({ ok: true });
      }
      case "schedule": {
        const at = b.startsAt ? new Date(String(b.startsAt)) : null;
        if (!at || isNaN(at.getTime())) return NextResponse.json({ error: "Choose the date and time." }, { status: 400 });
        await schedule(me, str(b.bookingId), at, str(b.mode), str(b.place, 300) || null);
        return NextResponse.json({ ok: true });
      }
      case "cancel": await cancel({ kind: "staff", ...me }, str(b.bookingId), str(b.note || b.reason, 300)); return NextResponse.json({ ok: true });
      case "complete": await complete(me, str(b.bookingId), { held: b.held !== false && b.held !== "false", kind: str(b.kind), notes: str(b.notes, 8000), followUp: dateOrNull(b.followUp) }); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    const m = String((e as Error).message || e);
    return NextResponse.json({ error: /Unknown arg|does not exist|Cannot read properties of undefined/.test(m) ? COUNSEL_HINT : m.slice(0, 300) }, { status: 400 });
  }
}
