import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { govScope, inScope } from "../../../../lib/accreditation/governance";
import { vdb, agendaTemplate, LOGISTICS, FINDING_TYPES, POSITIONS, DECISIONS, OUTCOMES } from "../../../../lib/accreditation/visit";
import type { BodyKey } from "../../../../lib/accreditation/bodyInfer";

const s = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const FIELDS: Record<string, string[]> = { AGENDA: ["day", "time", "session", "with", "venue", "host"], PANEL: ["name", "role", "organization", "contact", "arrival"], LOGISTICS: ["task", "note"], FINDING: ["criterion", "type", "observation", "response", "action"], IMPLEMENTATION: ["finding", "action", "responsible", "resources", "timeline", "indicator"], REPORT: ["reportReceived", "rebuttalDue", "rebuttalSent", "decisionReceived", "reference"] };

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
      for (const f of FIELDS[kind]) d[f] = s(b[f], ["observation", "response", "action", "finding", "indicator"].includes(f) ? 3000 : 300);
      if (kind === "FINDING" && !FINDING_TYPES.some((t) => t[0] === d.type)) d.type = "OBSERVATION";
      if (!Object.values(d).some(Boolean)) return NextResponse.json({ error: "Fill in the details." }, { status: 400 });
      const extra = { ownerId: typeof b.ownerId === "string" && b.ownerId ? b.ownerId : null, dueDate: b.dueDate ? new Date(b.dueDate) : null };
      if (b.action === "add") { const n = await vdb.visitItem.count({ where: { cycleId: cycle.id, kind } }); await vdb.visitItem.create({ data: { cycleId: cycle.id, kind, sort: n, dataJson: JSON.stringify(d), ...extra } }); }
      else {
        // Keep what other actions stored on the item (rebuttal, evidence, progress, outcome); replace only these fields.
        const cur = await vdb.visitItem.findFirst({ where: { id: String(b.id || ""), cycleId: cycle.id } });
        let prev: Record<string, unknown> = {}; try { prev = JSON.parse(cur?.dataJson || "{}"); } catch { prev = {}; }
        await vdb.visitItem.updateMany({ where: { id: String(b.id || ""), cycleId: cycle.id }, data: { dataJson: JSON.stringify({ ...prev, ...d }), ...extra } });
      }
      return NextResponse.json({ ok: true });
    }
    // Rebuttals and follow-up: each merges into the finding's stored record.
    if (["position", "decision", "progress", "outcome"].includes(b.action)) {
      const f = await vdb.visitItem.findFirst({ where: { id: String(b.id || ""), cycleId: cycle.id, kind: "FINDING" } });
      if (!f) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
      let d: Record<string, unknown> = {}; try { d = JSON.parse(f.dataJson || "{}"); } catch { d = {}; }
      let status = f.status as string;
      if (b.action === "position") {
        d.position = POSITIONS.some((x) => x[0] === b.position) ? b.position : "ACCEPT";
        d.rebuttal = s(b.rebuttal, 6000);
        if (d.position !== "ACCEPT" && !d.rebuttal) return NextResponse.json({ error: "Write the rebuttal: why the finding is wrong or overstated, and what the evidence shows." }, { status: 400 });
        if (d.position === "ACCEPT") { delete d.decision; delete d.decisionNote; } else if (!d.decision) d.decision = "PENDING";
      }
      if (b.action === "decision") {
        d.decision = DECISIONS.some((x) => x[0] === b.decision) ? b.decision : "PENDING";
        d.decisionNote = s(b.decisionNote, 2000);
        if (d.position === "REBUT" && d.decision === "ACCEPTED") status = "DONE"; // withdrawn: nothing left to fix
      }
      if (b.action === "progress") {
        const pct = Math.max(0, Math.min(100, Math.round(Number(b.pct) || 0)));
        const note = s(b.note, 2000);
        if (!note) return NextResponse.json({ error: "Say what was done." }, { status: 400 });
        const log = Array.isArray(d.progress) ? (d.progress as unknown[]) : [];
        log.push({ on: new Date().toISOString().slice(0, 10), pct, note, by: user.name });
        d.progress = log.slice(-60);
        if (!d.outcome || d.outcome === "OPEN") d.outcome = "IMPROVING";
        status = pct >= 100 ? "DONE" : "IN_PROGRESS";
      }
      if (b.action === "outcome") {
        d.outcome = OUTCOMES.some((x) => x[0] === b.outcome) ? b.outcome : "IMPROVING";
        d.outcomeNote = s(b.outcomeNote, 3000); d.metricBefore = s(b.metricBefore, 300); d.metricAfter = s(b.metricAfter, 300);
        if ((d.outcome === "RESOLVED" || d.outcome === "STRENGTH") && !d.outcomeNote) return NextResponse.json({ error: "Describe the evidence that it is resolved." }, { status: 400 });
        status = d.outcome === "RESOLVED" || d.outcome === "STRENGTH" ? "DONE" : d.outcome === "IMPROVING" ? "IN_PROGRESS" : "OPEN";
      }
      await vdb.visitItem.update({ where: { id: f.id }, data: { dataJson: JSON.stringify(d), status } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "report") {
      const d: Record<string, string> = {}; for (const k of FIELDS.REPORT) d[k] = s(b[k], 120);
      const cur = await vdb.visitItem.findFirst({ where: { cycleId: cycle.id, kind: "REPORT" } });
      if (cur) await vdb.visitItem.update({ where: { id: cur.id }, data: { dataJson: JSON.stringify(d), dueDate: d.rebuttalDue ? new Date(d.rebuttalDue) : null } });
      else await vdb.visitItem.create({ data: { cycleId: cycle.id, kind: "REPORT", sort: 0, dataJson: JSON.stringify(d), dueDate: d.rebuttalDue ? new Date(d.rebuttalDue) : null } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "status") { await vdb.visitItem.updateMany({ where: { id: String(b.id || ""), cycleId: cycle.id }, data: { status: ["OPEN", "IN_PROGRESS", "DONE"].includes(b.status) ? b.status : "OPEN" } }); return NextResponse.json({ ok: true }); }
    if (b.action === "delete") { await vdb.visitItem.deleteMany({ where: { id: String(b.id || ""), cycleId: cycle.id } }); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_visit.sql first." }, { status: 500 }); }
}
