import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, rdb, str, num, dateOrNull, staffOf, day } from "../../../lib/registers";
import { COM_HINT, KINDS, ROLES, STATUSES, canManageCommittees, canSeeCases, annual, compliance, type Committee, type Member, type Case } from "../../../lib/committees";

/** GET ?report=<committeeId>&year=YYYY — the committee's annual report (Word, no names in cases). */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  const q = new URL(req.url).searchParams;
  const c = w ? ((await rdb.committee.findUnique({ where: { id: String(q.get("report") || "") } }).catch(() => null)) as Committee | null) : null;
  if (!w || !c || c.chairmanId !== w.chairmanId || !(canManageCommittees(w) || w.leader || (await canSeeCases(w, c.id)))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const year = Number(q.get("year")) || new Date().getFullYear();
  const [members, meetings, cases] = await Promise.all([rdb.committeeMember.findMany({ where: { committeeId: c.id } }), rdb.committeeMeeting.findMany({ where: { committeeId: c.id }, orderBy: { date: "asc" } }), rdb.committeeCase.findMany({ where: { committeeId: c.id } })]) as [Member[], { date: Date; agenda: string | null; decisions: string | null }[], Case[]];
  const a = annual(c, members, meetings, cases, year);
  const comp = compliance(c, members);
  const cell = (t: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t || "—", bold, size: 19 })] })] });
  const table = (head: string[], rows: string[][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: head.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((x) => cell(x)) }))] });
  const p = (t: string, o: { bold?: boolean } = {}) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: t, bold: o.bold, size: 21 })] });
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${c.name} — annual report ${year}`)] }),
    p(`${(KINDS[c.kind] || KINDS.OTHER).label}${c.policyRef || KINDS[c.kind]?.policy ? ` under ${c.policyRef || KINDS[c.kind].policy}` : ""}.`),
    p(`Term: ${day(c.termStart)} to ${day(c.termEnd)}. Composition ${comp.ok ? "meets the policy" : `does not meet the policy: ${comp.issues.join("; ")}`}.`),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Members")] }),
    table(["Name", "Role", "Organisation", "From", "To"], a.members.map((m) => [m.name, ROLES[m.role] || m.role, m.organisation || "", day(m.fromDate), day(m.toDate)])),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`Meetings (${a.meetings.length})`)] }),
    table(["Date", "Agenda", "Decisions"], (a.meetings as { date: Date; agenda: string | null; decisions: string | null }[]).map((m) => [day(m.date), m.agenda || "", m.decisions || ""])),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Cases (no names)")] }),
    p(`Received in ${year}: ${a.received}. Closed in ${year}: ${a.closed}. Open now: ${a.open}${a.overdue ? ` (${a.overdue} past the time limit)` : ""}. ${a.avgDays !== null ? `Average time to close: ${a.avgDays} days.` : ""}`),
    table(["Category", "Cases received"], a.byCategory.map(([k, n]) => [k, String(n)])),
  ] }] });
  return new NextResponse((await Packer.toBuffer(doc)) as unknown as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${c.name.replace(/[^\w .()-]+/g, "")} annual report ${year}.docx"` } });
}

/**
 * POST { action, ... }
 *   create { kind, name, policyRef, termStart, termEnd }   term { id, termStart, termEnd }
 *   member { id, userId | name, role, gender, organisation, fromDate }   endMember { memberId }
 *   meeting { id, date, agenda, decisions, attendees }
 *   case { id, category, receivedAt, notes }   caseUpdate { caseId, status, outcome, notes }  (members and the head only)
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "create") {
      if (!canManageCommittees(w)) return NextResponse.json({ error: "Only the institute head, Dean or QEC In-charge sets up committees." }, { status: 403 });
      const kind = KINDS[String(b.kind)] ? String(b.kind) : "OTHER";
      const id = randomUUID();
      await rdb.committee.create({ data: { id, chairmanId: w.chairmanId, kind, name: str(b.name, 160) || KINDS[kind].label, policyRef: str(b.policyRef, 300) || null, termStart: dateOrNull(b.termStart), termEnd: dateOrNull(b.termEnd) } });
      await writeAuditLog({ actorUserId: w.id, action: "COMMITTEE_CREATED", entityType: "Committee", entityId: id, metadata: { kind } });
      return NextResponse.json({ ok: true, id });
    }
    if (b.action === "endMember" || b.action === "caseUpdate") {
      const row = b.action === "endMember" ? await rdb.committeeMember.findUnique({ where: { id: String(b.memberId || "") } }) : await rdb.committeeCase.findUnique({ where: { id: String(b.caseId || "") } });
      const c = row ? ((await rdb.committee.findUnique({ where: { id: row.committeeId } })) as Committee | null) : null;
      if (!row || !c || c.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Not found." }, { status: 404 });
      if (b.action === "endMember") {
        if (!canManageCommittees(w)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        await rdb.committeeMember.update({ where: { id: row.id }, data: { toDate: new Date() } });
        return NextResponse.json({ ok: true });
      }
      if (!(await canSeeCases(w, c.id))) return NextResponse.json({ error: "Only the committee's members handle its cases." }, { status: 403 });
      const status = STATUSES[String(b.status)] ? String(b.status) : row.status;
      await rdb.committeeCase.update({ where: { id: row.id }, data: { status, outcome: str(b.outcome, 3000) || row.outcome, notes: str(b.notes, 3000) || row.notes, closedAt: ["CLOSED", "DECIDED"].includes(status) ? row.closedAt || new Date() : null, updatedAt: new Date() } });
      await writeAuditLog({ actorUserId: w.id, action: "COMMITTEE_CASE_UPDATED", entityType: "CommitteeCase", entityId: row.id, metadata: { status } });
      return NextResponse.json({ ok: true });
    }
    const c = (await rdb.committee.findUnique({ where: { id: String(b.id || "") } })) as Committee | null;
    if (!c || c.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Committee not found." }, { status: 404 });
    const member = await canSeeCases(w, c.id);
    if (b.action === "case") {
      if (!member) return NextResponse.json({ error: "Only the committee's members record its cases." }, { status: 403 });
      const k = KINDS[c.kind] || KINDS.OTHER;
      const n = await rdb.committeeCase.count({ where: { committeeId: c.id } });
      const year = (dateOrNull(b.receivedAt) || new Date()).getFullYear();
      const caseNo = `${c.kind.slice(0, 3)}-${year}-${String(n + 1).padStart(3, "0")}`;
      await rdb.committeeCase.create({ data: { id: randomUUID(), committeeId: c.id, caseNo, receivedAt: dateOrNull(b.receivedAt) || new Date(), category: k.categories.includes(String(b.category)) ? String(b.category) : "Other", notes: str(b.notes, 3000) || null, createdById: w.id } });
      const members = (await rdb.committeeMember.findMany({ where: { committeeId: c.id, toDate: null } })) as Member[];
      await notifyUsers(members.map((m) => m.userId), { kind: "COMMITTEE", title: `${c.name}: new case ${caseNo}`, href: `/committees?id=${c.id}`, exceptId: w.id });
      await writeAuditLog({ actorUserId: w.id, action: "COMMITTEE_CASE_RECEIVED", entityType: "Committee", entityId: c.id, metadata: { caseNo } });
      return NextResponse.json({ ok: true, caseNo });
    }
    if (b.action === "meeting") {
      if (!member && !canManageCommittees(w)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const date = dateOrNull(b.date);
      if (!date) return NextResponse.json({ error: "Give the meeting date." }, { status: 400 });
      await rdb.committeeMeeting.create({ data: { id: randomUUID(), committeeId: c.id, date, agenda: str(b.agenda, 3000) || null, decisions: str(b.decisions, 3000) || null, attendees: num(b.attendees), createdById: w.id } });
      return NextResponse.json({ ok: true });
    }
    if (!canManageCommittees(w)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (b.action === "term") { await rdb.committee.update({ where: { id: c.id }, data: { termStart: dateOrNull(b.termStart), termEnd: dateOrNull(b.termEnd), policyRef: str(b.policyRef, 300) || c.policyRef } }); return NextResponse.json({ ok: true }); }
    if (b.action === "member") {
      const s = b.userId ? (await staffOf(w.chairmanId)).find((x) => x.id === String(b.userId)) : null;
      const name = s?.name || str(b.name, 120);
      if (!name) return NextResponse.json({ error: "Choose a member of staff or give an outside member's name." }, { status: 400 });
      let gender = str(b.gender, 10) || null;
      if (!gender && s) { const p = await rdb.facultyProfile.findUnique({ where: { userId: s.id }, select: { gender: true } }).catch(() => null); gender = p?.gender || null; }
      await rdb.committeeMember.create({ data: { id: randomUUID(), committeeId: c.id, userId: s?.id || null, name, role: ROLES[String(b.role)] ? String(b.role) : "MEMBER", gender, organisation: str(b.organisation, 160) || null, fromDate: dateOrNull(b.fromDate) || new Date() } });
      if (s) await notifyUsers([s.id], { kind: "COMMITTEE", title: `You are on the ${c.name}`, href: `/committees?id=${c.id}`, exceptId: w.id });
      await writeAuditLog({ actorUserId: w.id, action: "COMMITTEE_MEMBER_ADDED", entityType: "Committee", entityId: c.id, metadata: {} });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? COM_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
