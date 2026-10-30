import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { govScope, inScope } from "../../../../lib/accreditation/governance";
import { seed, addItem, updateItem, addFinding, closeFinding, VISIT_HINT, STATUSES } from "../../../../lib/visitDay";
import { withErrors } from "../../../../lib/apiHandler";

const vdb = prisma as unknown as Record<string, any>;
const day = (s: unknown) => (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(`${s}T00:00:00Z`) : null);
const time = (s: unknown) => (s && /^\d{1,2}:\d{2}$/.test(String(s).trim()) ? String(s).trim() : null);

// POST { cycleId, action, ... } — seed | add | update | delete | finding | close
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const c = await prisma.accreditationCycle.findUnique({ where: { id: String(b.cycleId || "") } }).catch(() => null);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const s = await govScope(user);
  const manage = !!s && inScope(s, c) && (s.canManage || c.leadId === user.id);
  try {
    if (b.action === "update" || b.action === "close") {
      const row = b.action === "update" ? await vdb.visitDayItem.findFirst({ where: { id: String(b.id), cycleId: c.id } }) : await vdb.mockVisitFinding.findFirst({ where: { id: String(b.id), cycleId: c.id } });
      if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (!manage && row.ownerId !== user.id) return NextResponse.json({ error: "Only the person in charge or the visit team can update this." }, { status: 403 });
      if (b.action === "close") { await closeFinding(c.id, row.id, b.done !== false, b.note ? String(b.note).slice(0, 500) : null); return NextResponse.json({ ok: true }); }
      const d: Parameters<typeof updateItem>[2] = {};
      if (b.status !== undefined) { if (!STATUSES[b.status]) return NextResponse.json({ error: "Unknown status." }, { status: 400 }); d.status = b.status; }
      if (b.note !== undefined) d.note = b.note ? String(b.note).slice(0, 500) : null;
      if (manage) {
        if (b.ownerId !== undefined) d.ownerId = b.ownerId || null;
        if (b.title) d.title = String(b.title).slice(0, 200);
        if (b.place !== undefined) d.place = b.place ? String(b.place).slice(0, 120) : null;
        if (time(b.startTime)) d.startTime = time(b.startTime)!;
        if (time(b.endTime)) d.endTime = time(b.endTime)!;
      }
      await updateItem(c, row.id, d, user);
      return NextResponse.json({ ok: true });
    }
    if (!manage) return NextResponse.json({ error: "Only the visit team can change the plan." }, { status: 403 });
    if (b.action === "seed") return NextResponse.json({ ok: true, added: await seed(c.chairmanId, c.id, c.visitDate, user.id) });
    if (b.action === "add") {
      const title = String(b.title || "").trim().slice(0, 200);
      if (!title) return NextResponse.json({ error: "Give a title." }, { status: 400 });
      await addItem(c.chairmanId, c.id, { kind: b.kind === "CHECK" ? "CHECK" : "PLAN", title, startTime: time(b.startTime), endTime: time(b.endTime), place: b.place ? String(b.place).slice(0, 120) : null, category: b.category || null, dayDate: day(b.dayDate) || c.visitDate }, user.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete") { await vdb.visitDayItem.deleteMany({ where: { id: String(b.id), cycleId: c.id } }); return NextResponse.json({ ok: true }); }
    if (b.action === "finding") {
      const area = String(b.area || "").trim().slice(0, 120), finding = String(b.finding || "").trim().slice(0, 2000), rec = String(b.recommendation || "").trim().slice(0, 2000);
      if (!area || !finding || !rec) return NextResponse.json({ error: "Give the area, the finding and the recommendation." }, { status: 400 });
      await addFinding(c, { area, finding, recommendation: rec, severity: ["HIGH", "MEDIUM", "LOW"].includes(b.severity) ? b.severity : "MEDIUM", ownerId: b.ownerId || null, dueDate: day(b.dueDate) }, user.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    console.error("visit-day", e);
    return NextResponse.json({ error: VISIT_HINT }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
