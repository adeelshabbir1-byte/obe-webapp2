import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, rdb, str, dateOrNull, num, parseJ, staffOf } from "../../../lib/registers";
import { QAA_HINT, STAGES, canManageQaa, teamOf, type Cycle, type Member } from "../../../lib/qaa";

/**
 * POST { action, ... }
 *   create { program, title }            dates { id, <stage date fields>, sarDueAt }
 *   member { id, team: "PT"|"AT", userId | name, role, organisation }     unmember { id, team, index }
 *   document { id, label, url }           summary { id, atSummary }
 *   addAction { id, finding, action, ownerId, dueDate }    progress { actionId, progressPct, progressNote, done }
 * The Head, Dean, HOD or QEC In-charge manage a cycle; an action's owner updates its progress.
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "progress") {
      const a = await rdb.qaaAction.findUnique({ where: { id: String(b.actionId || "") } });
      const c = a ? ((await rdb.qaaCycle.findUnique({ where: { id: a.cycleId } })) as Cycle | null) : null;
      if (!a || !c || c.chairmanId !== w.chairmanId || (a.ownerId !== w.id && !canManageQaa(w))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const done = !!b.done;
      const pct = done ? 100 : Math.min(Math.max(num(b.progressPct) ?? a.progressPct, 0), 100);
      await rdb.qaaAction.update({ where: { id: a.id }, data: { progressPct: pct, progressNote: str(b.progressNote, 2000) || a.progressNote, status: done || pct >= 100 ? "DONE" : pct > 0 ? "IN_PROGRESS" : "OPEN", doneAt: done || pct >= 100 ? new Date() : null, updatedAt: new Date() } });
      await writeAuditLog({ actorUserId: w.id, action: "QAA_ACTION_PROGRESS", entityType: "QaaAction", entityId: a.id, metadata: { pct } });
      return NextResponse.json({ ok: true });
    }
    if (!canManageQaa(w)) return NextResponse.json({ error: "Only the institute head, Dean, HOD or the QEC In-charge manage the QAA cycle." }, { status: 403 });
    if (b.action === "create") {
      const program = str(b.program, 120), title = str(b.title, 200) || `Self-assessment ${new Date().getFullYear()}`;
      if (!program) return NextResponse.json({ error: "Choose the program." }, { status: 400 });
      const id = randomUUID();
      await rdb.qaaCycle.create({ data: { id, chairmanId: w.chairmanId, program, title, createdById: w.id } });
      await writeAuditLog({ actorUserId: w.id, action: "QAA_CYCLE_CREATED", entityType: "QaaCycle", entityId: id, metadata: { program } });
      return NextResponse.json({ ok: true, id });
    }
    const c = (await rdb.qaaCycle.findUnique({ where: { id: String(b.id || "") } })) as Cycle | null;
    if (!c || c.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Cycle not found." }, { status: 404 });
    const save = async (data: Record<string, unknown>, what: string) => { await rdb.qaaCycle.update({ where: { id: c.id }, data: { ...data, updatedAt: new Date() } }); await writeAuditLog({ actorUserId: w.id, action: "QAA_CYCLE_UPDATED", entityType: "QaaCycle", entityId: c.id, metadata: { what } }); return NextResponse.json({ ok: true }); };
    if (b.action === "dates") {
      const data: Record<string, Date | null> = {};
      for (const k of [...STAGES.map((s) => s.key as string), "sarDueAt"]) if (k in b) data[k] = dateOrNull(b[k]);
      if (data.closedAt) { const open = await rdb.qaaAction.count({ where: { cycleId: c.id, status: { not: "DONE" } } }); if (open) return NextResponse.json({ error: `${open} action(s) are not done yet; close the cycle when every action is done.` }, { status: 400 }); }
      if (data.ptFormedAt && !c.ptFormedAt) await notifyUsers(teamOf(c).map((m) => m.userId), { kind: "QAA", title: `You are on the Program Team for the ${c.program} self-assessment`, href: `/qaa?id=${c.id}`, exceptId: w.id });
      return save(data, "dates");
    }
    if (b.action === "member") {
      const team = b.team === "AT" ? "assessmentTeamJson" : "programTeamJson";
      const list = parseJ<Member[]>(c[team as "programTeamJson"], []);
      let m: Member;
      if (b.team !== "AT") { const s = (await staffOf(w.chairmanId)).find((x) => x.id === String(b.userId || "")); if (!s) return NextResponse.json({ error: "Choose a member of staff." }, { status: 400 }); if (list.some((x) => x.userId === s.id)) return NextResponse.json({ error: "Already on the team." }, { status: 400 }); m = { userId: s.id, name: s.name, role: str(b.role, 60) || "Member" }; }
      else { const name = str(b.name, 120); if (!name) return NextResponse.json({ error: "Give the member's name." }, { status: 400 }); m = { name, role: str(b.role, 60) || "Member", organisation: str(b.organisation, 120) || undefined }; }
      list.push(m);
      if (m.userId && c.ptFormedAt) await notifyUsers([m.userId], { kind: "QAA", title: `You are on the Program Team for the ${c.program} self-assessment`, href: `/qaa?id=${c.id}`, exceptId: w.id });
      return save({ [team]: JSON.stringify(list) }, "member");
    }
    if (b.action === "unmember") {
      const team = b.team === "AT" ? "assessmentTeamJson" : "programTeamJson";
      const list = parseJ<Member[]>(c[team as "programTeamJson"], []);
      list.splice(Number(b.index), 1);
      return save({ [team]: JSON.stringify(list) }, "unmember");
    }
    if (b.action === "document") {
      const label = str(b.label, 160), url = str(b.url, 1000);
      if (!label || !/^(https?:\/\/|\/)/.test(url)) return NextResponse.json({ error: "Give the document's name and a link (https://… or a page of OBEHUB)." }, { status: 400 });
      const docs = parseJ<{ label: string; url: string; at: string }[]>(c.documentsJson, []);
      docs.push({ label, url, at: new Date().toISOString() });
      return save({ documentsJson: JSON.stringify(docs) }, "document");
    }
    if (b.action === "summary") return save({ atSummary: str(b.atSummary, 8000) || null }, "summary");
    if (b.action === "addAction") {
      const finding = str(b.finding, 2000), act = str(b.actionText, 2000);
      if (!finding || !act) return NextResponse.json({ error: "Write the finding and the action." }, { status: 400 });
      const ownerId = (await staffOf(w.chairmanId)).find((x) => x.id === String(b.ownerId || ""))?.id || null;
      await rdb.qaaAction.create({ data: { id: randomUUID(), cycleId: c.id, finding, action: act, ownerId, dueDate: dateOrNull(b.dueDate) } });
      if (ownerId) await notifyUsers([ownerId], { kind: "QAA", title: `${c.program} self-assessment: an action is yours — ${act.slice(0, 80)}`, href: `/qaa?id=${c.id}`, exceptId: w.id });
      await writeAuditLog({ actorUserId: w.id, action: "QAA_ACTION_ADDED", entityType: "QaaCycle", entityId: c.id, metadata: {} });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? QAA_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
