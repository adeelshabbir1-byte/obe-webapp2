import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { govScope, inScope } from "../../../../lib/accreditation/governance";
import { vdb, agendaTemplate, LOGISTICS, FINDING_TYPES } from "../../../../lib/accreditation/visit";
import type { BodyKey } from "../../../../lib/accreditation/bodyInfer";

const s = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const FIELDS: Record<string, string[]> = { AGENDA: ["day", "time", "session", "with", "venue", "host"], PANEL: ["name", "role", "organization", "contact", "arrival"], LOGISTICS: ["task", "note"], FINDING: ["criterion", "type", "observation", "response", "action"] };

// Managers (Institute Head, Dean, Chairman) and the program's own Lead plan the visit and answer its findings.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sc = await govScope(user);
  const b = await req.json().catch(() => ({}));
  const cycle = await prisma.accreditationCycle.findUnique({ where: { id: String(b.cycleId || "") } });
  if (!sc || !cycle || !inScope(sc, cycle) || !(sc.canManage || cycle.leadId === user.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if (b.action === "template") {
      const have = await vdb.visitItem.count({ where: { cycleId: cycle.id, kind: { in: ["AGENDA", "LOGISTICS"] } } });
      if (have) return NextResponse.json({ error: "The agenda or checklist already has items." }, { status: 400 });
      await vdb.visitItem.createMany({ data: [
        ...agendaTemplate(cycle.body as BodyKey).map((a, i) => ({ cycleId: cycle.id, kind: "AGENDA", sort: i, dataJson: JSON.stringify(a) })),
        ...LOGISTICS.map((t, i) => ({ cycleId: cycle.id, kind: "LOGISTICS", sort: i, dataJson: JSON.stringify({ task: t }) })),
      ] });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "add" || b.action === "edit") {
      const kind = String(b.kind || "");
      if (!FIELDS[kind]) return NextResponse.json({ error: "bad kind" }, { status: 400 });
      const d: Record<string, string> = {};
      for (const f of FIELDS[kind]) d[f] = s(b[f], f === "observation" || f === "response" || f === "action" ? 3000 : 300);
      if (kind === "FINDING" && !FINDING_TYPES.some((t) => t[0] === d.type)) d.type = "OBSERVATION";
      if (!Object.values(d).some(Boolean)) return NextResponse.json({ error: "Fill in the details." }, { status: 400 });
      const extra = { ownerId: typeof b.ownerId === "string" && b.ownerId ? b.ownerId : null, dueDate: b.dueDate ? new Date(b.dueDate) : null };
      if (b.action === "add") { const n = await vdb.visitItem.count({ where: { cycleId: cycle.id, kind } }); await vdb.visitItem.create({ data: { cycleId: cycle.id, kind, sort: n, dataJson: JSON.stringify(d), ...extra } }); }
      else await vdb.visitItem.updateMany({ where: { id: String(b.id || ""), cycleId: cycle.id }, data: { dataJson: JSON.stringify(d), ...extra } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "status") { await vdb.visitItem.updateMany({ where: { id: String(b.id || ""), cycleId: cycle.id }, data: { status: ["OPEN", "IN_PROGRESS", "DONE"].includes(b.status) ? b.status : "OPEN" } }); return NextResponse.json({ ok: true }); }
    if (b.action === "delete") { await vdb.visitItem.deleteMany({ where: { id: String(b.id || ""), cycleId: cycle.id } }); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_visit.sql first." }, { status: 500 }); }
}
