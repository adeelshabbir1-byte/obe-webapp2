import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { bookRoom, changeClass } from "../../../../lib/timetableLive";
import { canDo } from "../../../../lib/delegation";
import { notifyUsers } from "../../../../lib/notifications";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;
const LEADERS = ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN"];

// POST { action, … } — classes in reality (Adeel prompt §22–23):
//  change   { entryId, kind: MOVE_ONCE | MOVE_FROM | CANCEL | MAKEUP | SUBSTITUTE, date, toStart, toEnd, toRoomId, substituteId, reason }
//  book     { date, start, end, roomId, title, entryId? }
//  approve  { id, approve } — a pending permanent move (PL / DC)
//  register { entryId, date, startedAt, endedAt, roomId, held, note } — floor attendant
//  review   { id, review: PENALISE | EXCUSED, reason } — Program Lead (or delegate); reply { id, reply } — the teacher, once
//  token    { kind: ICS | KIOSK, roomId?, label? } / revoke { token }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const leader = LEADERS.includes(user.role) || (await canDo(user, "dc.timetableChanges")).ok;
  try {
    switch (b.action) {
      case "change": return NextResponse.json(await changeClass({ ...user, role: leader ? "DEPARTMENT_COORDINATOR" : user.role }, cid, b as never));
      case "book": await bookRoom(user, cid, { date: b.date, start: Number(b.start), end: Number(b.end), roomId: b.roomId, title: String(b.title || "Booking"), entryId: b.entryId }); return NextResponse.json({ ok: true });
      case "approve": {
        if (!leader) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const c = await db.timetableChange.findUnique({ where: { id: b.id } });
        if (!c || c.chairmanId !== cid || c.status !== "PENDING") return NextResponse.json({ error: "Not pending." }, { status: 404 });
        await db.timetableChange.update({ where: { id: b.id }, data: { status: b.approve ? "ACTIVE" : "REFUSED", approvedById: user.id } });
        await notifyUsers([c.byId], { kind: "TIMETABLE", title: b.approve ? "Your permanent class change is approved" : "Your permanent class change was refused", href: "/timetable/live" });
        return NextResponse.json({ ok: true });
      }
      case "register": {
        if (!leader && !(await canDo(user, "dc.floorRegister")).ok) return NextResponse.json({ error: "Only the floor attendant (or the Department Coordinator) keeps the register." }, { status: 403 });
        const date = new Date(String(b.date) + "T00:00:00Z");
        if (Date.now() - date.getTime() > 2 * 864e5) return NextResponse.json({ error: "Corrections are allowed the same day only." }, { status: 409 });
        const data = { startedAt: b.held === false ? null : Number(b.startedAt), endedAt: b.endedAt != null && b.endedAt !== "" ? Number(b.endedAt) : null, roomId: b.roomId || null, held: b.held !== false, note: b.note ? String(b.note).slice(0, 200) : null, byId: user.id, updatedAt: new Date() };
        await db.floorRegister.upsert({ where: { entryId_date: { entryId: b.entryId, date } }, create: { id: randomUUID(), chairmanId: cid, entryId: b.entryId, date, ...data }, update: data });
        return NextResponse.json({ ok: true });
      }
      case "review": {
        if (!["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role) && !(await canDo(user, "pl.review")).ok) return NextResponse.json({ error: "Only the Program Lead (or his delegate) reviews differences." }, { status: 403 });
        if (b.review === "EXCUSED" && String(b.reason || "").trim().length < 3) return NextResponse.json({ error: "Type the genuine reason." }, { status: 400 });
        const r = await db.floorRegister.update({ where: { id: b.id }, data: { review: b.review === "PENALISE" ? "PENALISE" : "EXCUSED", reviewReason: b.reason ? String(b.reason).slice(0, 200) : null, reviewedById: user.id, reviewedAt: new Date() } });
        const entry = await prisma.timetableEntry.findUnique({ where: { id: r.entryId }, select: { scheduleSection: { select: { instructorId: true } } } });
        if (entry) await notifyUsers([entry.scheduleSection.instructorId], { kind: "TIMETABLE", title: b.review === "PENALISE" ? "A late / short class was marked: penalised" : "A late / short class was excused", body: b.reason || "", href: "/timetable/live?tab=log" });
        return NextResponse.json({ ok: true });
      }
      case "reply": {
        const r = await db.floorRegister.findUnique({ where: { id: b.id } });
        const entry = r ? await prisma.timetableEntry.findUnique({ where: { id: r.entryId }, select: { scheduleSection: { select: { instructorId: true } } } }) : null;
        if (!r || entry?.scheduleSection.instructorId !== user.id || r.teacherReply) return NextResponse.json({ error: "You can reply once, to your own classes." }, { status: 403 });
        await db.floorRegister.update({ where: { id: b.id }, data: { teacherReply: String(b.reply || "").slice(0, 300) } });
        return NextResponse.json({ ok: true });
      }
      case "token": {
        const token = randomBytes(18).toString("base64url");
        if (b.kind === "KIOSK" && !leader) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        await db.timetableToken.create({ data: { token, chairmanId: cid, kind: b.kind === "KIOSK" ? "KIOSK" : "ICS", userId: b.kind === "KIOSK" ? null : user.id, roomId: b.roomId || null, label: b.label ? String(b.label).slice(0, 80) : null } });
        return NextResponse.json({ token });
      }
      case "revoke": {
        const t = await db.timetableToken.findUnique({ where: { token: b.token } });
        if (!t || (t.userId !== user.id && !leader)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        await db.timetableToken.update({ where: { token: b.token }, data: { revokedAt: new Date() } });
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
