import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { MEETING_KINDS, MEETING_ROLES, fileScope } from "../../../lib/evidenceFiles";
import { schedule, recordMinutes, cancelMeeting, addAction, setAction, MEET_HINT } from "../../../lib/meetingsPlus";

const mdb = prisma as unknown as Record<string, any>;
const ORGANIZERS = [...MEETING_ROLES, "STUDENT_AFFAIRS"];
const day = (s: unknown) => (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(`${s}T00:00:00Z`) : null);
const txt = (s: unknown, n: number) => String(s || "").trim().slice(0, n);

// POST { action: schedule | minutes | cancel | addAction | actionDone }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const scope = await fileScope(user);
  try {
    if (b.action === "actionDone") {
      const a = await mdb.meetingAction.findUnique({ where: { id: String(b.id) } });
      if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (a.ownerId !== user.id && !ORGANIZERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      await setAction(a.id, b.done !== false);
      return NextResponse.json({ ok: true });
    }
    if (!ORGANIZERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (b.action === "schedule") {
      const date = day(b.date), title = txt(b.title, 200);
      if (!date || !title || !MEETING_KINDS[b.kind]) return NextResponse.json({ error: "Give the type, title and date." }, { status: 400 });
      const leadId = b.leadId ? String(b.leadId) : null;
      if (leadId && !scope.leadIds.includes(leadId)) return NextResponse.json({ error: "That program is not in your area." }, { status: 403 });
      await schedule(scope.chairmanId, { leadId, kind: b.kind, title, date, startTime: txt(b.startTime, 10) || null, venue: txt(b.venue, 120) || null, agenda: txt(b.agenda, 3000) || null, invitees: { faculty: ["ALL", "PROGRAM"].includes(b.faculty) ? b.faculty : "NONE", alumniProgram: b.alumniProgram || null, batchId: b.batchId || null, external: txt(b.external, 1000) || null } }, user);
      return NextResponse.json({ ok: true });
    }
    const m = await prisma.meetingMinutes.findUnique({ where: { id: String(b.meetingId || "") }, select: { id: true, chairmanId: true, title: true } });
    if (!m || m.chairmanId !== scope.chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (b.action === "minutes") { await recordMinutes(m.id, { attended: txt(b.attended, 3000), minutes: txt(b.minutes, 6000) }); return NextResponse.json({ ok: true }); }
    if (b.action === "cancel") { await cancelMeeting(m.id); return NextResponse.json({ ok: true }); }
    if (b.action === "addAction") {
      const text = txt(b.text, 1000);
      if (!text) return NextResponse.json({ error: "What has to be done?" }, { status: 400 });
      await addAction(m, { text, ownerId: b.ownerId || null, dueDate: day(b.dueDate) });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) { console.error("meeting-planner", e); return NextResponse.json({ error: MEET_HINT }, { status: 500 }); }
}
