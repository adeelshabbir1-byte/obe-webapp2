import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { loadSession, parse, xdb, type ExamPaperRow } from "../../../../../lib/exams";
import { examChairman } from "../../../../../lib/examBranch";
import { EXTRA_HINT, allowance, extraOf, logRoom, replaceDuty, saveExtra, saveOpts, type Extra } from "../../../../../lib/examsExtra";
import { notifyUsers } from "../../../../../lib/notifications";
import { withErrors } from "../../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
// Queue item 17. POST { action: extra | prefs | checkin | custody | ufm | replace }; GET ?allowance=csv.
async function ctx(id: string) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  const s = await loadSession(id);
  if (!s || s.chairmanId !== (await chairmanIdFor(user as never))) return null;
  return { user, s, manager: (await examChairman(user as never)) === s.chairmanId };
}
async function GET_handler(_req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx(params.id); if (!c?.manager) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await allowance(c.s.id);
  const q = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const csv = [["Name", "Duties", "Checked in", "Late", "Missed", "Amount"].map(q).join(","), ...rows.map((r) => [r.name, r.duties, r.checked, r.late, r.missed, r.amount].map(q).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="duty-allowance-${c.s.name.replace(/\W+/g, "-")}.csv"` } });
}
async function POST_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx(params.id); if (!c) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (b.action === "extra") {
      if (!c.manager) return NextResponse.json({ error: "Only the exam branch." }, { status: 403 });
      const e = (b.extra || {}) as Extra;
      await saveExtra(c.s.id, { rooms: e.rooms, extraRooms: (e.extraRooms || []).slice(0, 60), durations: e.durations, allowCoreCore: !!e.allowCoreCore, perStudents: e.perStudents, reservePerRooms: e.reservePerRooms, superintendent: !!e.superintendent, reduced: e.reduced, official: e.official, rate: e.rate, reportMinutes: e.reportMinutes, costShares: (e.costShares || []).filter((x) => x.name && x.pct > 0).slice(0, 10), otherCosts: e.otherCosts });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "prefs") { await saveOpts(c.s.id, c.user.id, b.opts || {}); return NextResponse.json({ ok: true }); }
    const slotKey = String(b.slotKey || ""), roomId = String(b.roomId || "");
    if (b.action === "replace") {
      if (!c.manager) return NextResponse.json({ error: "Only the exam branch." }, { status: 403 });
      await replaceDuty(c.user, c.s.id, slotKey, roomId, String(b.fromId), String(b.toId)); return NextResponse.json({ ok: true });
    }
    // Duty holders only: the person must be on duty in that room at that time (or be the exam branch).
    const [date, slot] = slotKey.split(":");
    const papers = (await xdb.examPaper.findMany({ where: { sessionId: c.s.id, slot: Number(slot) } })) as ExamPaperRow[];
    const onDuty = papers.some((p) => p.date && new Date(p.date).toISOString().slice(0, 10) === date && parse<{ roomId: string; userIds: string[] }[]>(p.invigilatorsJson, []).some((r) => r.roomId === roomId && r.userIds.includes(c.user.id)))
      || Object.values((await extraOf(c.s.id)).slotStaff?.[slotKey] || {}).some((ids) => ids.includes(c.user.id));
    if (!onDuty && !c.manager) return NextResponse.json({ error: "You are not on duty there." }, { status: 403 });
    if (b.action === "checkin") {
      const e = await extraOf(c.s.id); const times = parse<string[]>(c.s.slotsJson, []); const m = /(\d{1,2}):(\d{2})/.exec(times[Number(slot)] || "");
      const start = m ? new Date(`${date}T${m[1].padStart(2, "0")}:${m[2]}:00+05:00`) : null;
      const late = !!start && Date.now() > start.getTime() - (e.reportMinutes || 0) * 60000;
      await logRoom(c.s.id, slotKey, roomId, "CHECKIN", c.user.id, { late }); return NextResponse.json({ ok: true, late });
    }
    if (b.action === "custody") { await logRoom(c.s.id, slotKey, roomId, "CUSTODY", c.user.id, { packet: String(b.packet || "").slice(0, 80), booklets: String(b.booklets || "").slice(0, 20), returned: String(b.returned || "").slice(0, 20) }); return NextResponse.json({ ok: true }); }
    if (b.action === "ufm") {
      await logRoom(c.s.id, slotKey, roomId, "UFM", c.user.id, { roll: String(b.roll || "").slice(0, 40), what: String(b.what || "").slice(0, 1000) });
      const staff = ((await xdb.examStaff?.findMany({ where: { chairmanId: c.s.chairmanId }, select: { userId: true } }).catch(() => [])) || []) as { userId: string }[];
      await notifyUsers([c.s.chairmanId, ...staff.map((x) => x.userId)], { kind: "ASSIGNMENT", title: `${c.s.name}: unfair-means report`, body: `${slotKey}, room ${roomId}, roll ${String(b.roll || "")}`, href: `/exams/${c.s.id}?tab=day` });
      return NextResponse.json({ ok: true });
    }
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /examSessionExtra|examRoomLog|examDutyOpt|does not exist/.test(m) ? EXTRA_HINT : m }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
