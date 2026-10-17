import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { fypAccess } from "../../../../lib/fyp";

const odb = prisma as unknown as Record<string, any>;
const KINDS = ["INTERVIEW", "USHER", "REFRESHMENT", "PRINT", "OTHER"];
const when = (v: unknown) => { if (!v) return null; const d = new Date(String(v)); return isNaN(d.getTime()) ? null : d; };

// POST { cycleId, action: add | update | delete | status | posters, ... } — the FYP Head / Committee manage open-house logistics.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const acc = await fypAccess(user);
  const cycle = await prisma.fypCycle.findFirst({ where: { id: String(b.cycleId || ""), chairmanId: acc.chairmanId } });
  if (!cycle || !acc.manages(cycle.departmentId)) return NextResponse.json({ error: "Only the FYP Head / Committee manage the open house." }, { status: 403 });
  try {
    if (b.action === "posters") {
      // One poster item per group, with the print deadline; students submit their poster link from their FYP page.
      const groups = await prisma.fypGroup.findMany({ where: { cycleId: cycle.id, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true, name: true } });
      const have = new Set(((await odb.fypOpenHouseItem.findMany({ where: { cycleId: cycle.id, kind: "PRINT", groupId: { not: null } } })) as { groupId: string }[]).map((x) => x.groupId));
      const due = when(b.due);
      await odb.fypOpenHouseItem.createMany({ data: groups.filter((g) => !have.has(g.id)).map((g) => ({ cycleId: cycle.id, kind: "PRINT", title: `Poster — ${g.name}`, groupId: g.id, endAt: due, qty: 1, status: "NOT_SUBMITTED" })) });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete") { await odb.fypOpenHouseItem.deleteMany({ where: { id: String(b.id), cycleId: cycle.id } }); return NextResponse.json({ ok: true }); }
    if (b.action === "status") { await odb.fypOpenHouseItem.updateMany({ where: { id: String(b.id), cycleId: cycle.id }, data: { status: String(b.status || "PLANNED").slice(0, 20) } }); return NextResponse.json({ ok: true }); }
    const kind = KINDS.includes(b.kind) ? b.kind : "OTHER";
    const title = String(b.title || "").trim().slice(0, 160);
    if (!title) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
    const startAt = when(b.startAt), endAt = when(b.endAt);
    if (startAt && endAt && endAt < startAt) return NextResponse.json({ error: "End is before start." }, { status: 400 });
    const data = { kind, title, ownerId: b.ownerId ? String(b.ownerId) : null, ownerText: b.ownerText ? String(b.ownerText).slice(0, 80) : null, room: b.room ? String(b.room).slice(0, 60) : null, startAt, endAt, qty: Number(b.qty) > 0 ? Math.round(Number(b.qty)) : null, vendor: b.vendor ? String(b.vendor).slice(0, 80) : null, note: b.note ? String(b.note).slice(0, 1000) : null };
    if (b.action === "update") await odb.fypOpenHouseItem.updateMany({ where: { id: String(b.id), cycleId: cycle.id }, data });
    else await odb.fypOpenHouseItem.create({ data: { ...data, cycleId: cycle.id, status: kind === "REFRESHMENT" ? "PLANNED" : "PLANNED" } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Not set up yet — run prisma/migration_fyp_plan.sql." }, { status: 500 }); }
}
