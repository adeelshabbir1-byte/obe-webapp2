import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { staffOf } from "../../../lib/registers";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { FinaliseForm, PdfForm, VoteForm } from "../../../components/BoardClient";
import { OUTCOME_LABEL, VOTE_LABEL, tallyLine } from "../../../lib/committeeCore";
import { TYPES, committee, itemTally, itemsOf, manages, membersOf, memberFor, type Meeting } from "../../../lib/committeeEngine";
import { CMT_ROLES, composition, endingSoon, metaOf } from "../../../lib/committeeMeta";
import CommitteeMembers from "../../../components/CommitteeMembers";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// One committee: members, meetings (attendance, minutes PDF, signed copy), agenda items with votes and decisions.
export default async function Board({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const c = await committee(params.id).catch(() => null);
  if (!c || c.chairmanId !== (await chairmanIdFor(user as never).catch(() => ""))) notFound();
  const [members, items, meetings, staff] = await Promise.all([membersOf(c.id), itemsOf(c.id), db.cmtMeeting.findMany({ where: { committeeId: c.id }, orderBy: { date: "desc" } }) as Promise<Meeting[]>, staffOf(c.chairmanId)]);
  const me = await memberFor(user.id, c.id);
  const manage = await manages(user, c), convener = c.convenerId === user.id;
  const meta = await metaOf(c.chairmanId, c.id);
  const comp = composition(meta, members, c.convenerId);
  const ending = new Set(endingSoon(meta, 60).map((x) => x.memberId));
  // People to suggest: the committee's department / faculty, or the heads for an institute committee.
  const inScope = manage ? await prisma.user.findMany({ where: { isActive: true, ...(c.scope === "DEPARTMENT" && c.scopeId ? { departmentId: c.scopeId } : c.scope === "FACULTY" && c.scopeId ? { OR: [{ facultyId: c.scopeId }, { department_: { is: { facultyId: c.scopeId } } }] } : { role: { in: ["DEAN", "HEAD_OF_DEPARTMENT"] as ("DEAN" | "HEAD_OF_DEPARTMENT")[] }, OR: [{ id: c.chairmanId }, { managedById: c.chairmanId }] }) } as never, select: { id: true, name: true, role: true }, take: 80 }).catch(() => []) : [];
  const memberIds = new Set(members.map((m) => m.userId).filter(Boolean));
  const ROLE_NOTE: Record<string, string> = { DEAN: "Dean", HEAD_OF_DEPARTMENT: "HOD", PROGRAM_COORDINATOR: "Program Lead", SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Faculty" };
  const tallies = await Promise.all(items.map((i) => itemTally(i, c, members)));
  const convenerName = members.find((m) => m.userId === c.convenerId)?.name || staff.find((s) => s.id === c.convenerId)?.name || "—";

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href="/boards">← Boards &amp; committees</Link></p>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>{c.name}</h1>
      <p className="small-note" style={{ margin: "0 0 8px" }}>{TYPES[c.type]} · {c.mode === "FULL" ? `Full committee: quorum ${c.quorumPct}% of members, approval needs more than ${c.majorityPct}% of the votes cast, the Convener finalises` : "Convener only: the Convener records each decision with the meeting date and the signed minutes"} · Convener: {convenerName}{c.councilStep ? " · then Academic Council noted / approved" : ""}</p>
      {manage && <ActionForm url="/api/cmt" fixed={{ action: "save", id: c.id, type: c.type, scope: c.scope, scopeId: c.scopeId }} submit="Save" collapsed openLabel="Settings…" initial={{ name: c.name, mode: c.mode, quorumPct: c.quorumPct, majorityPct: c.majorityPct, convenerId: c.convenerId || "", councilStep: c.councilStep }} fields={[{ name: "name", label: "Name", type: "text", width: 260 }, { name: "mode", label: "Mode", type: "select", options: [["FULL", "Full committee (votes)"], ["CONVENER_ONLY", "Convener only"]] }, { name: "quorumPct", label: "Quorum %", type: "number", width: 80 }, { name: "majorityPct", label: "Majority over %", type: "number", width: 90 }, { name: "convenerId", label: "Convener", type: "select", options: staff.map((s) => [s.id, s.name] as [string, string]), width: 200 }, { name: "councilStep", label: "Academic Council step", type: "checkbox" }]} />}

      <CommitteeMembers committeeId={c.id} manage={manage} roles={CMT_ROLES} secretary={meta.secretaryId || ""} canSecretary={["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)}
        members={members.map((m) => ({ id: m.id, name: m.name, external: m.external, organisation: m.organisation, role: comp.roleOf(m), from: meta.roles[m.id]?.from, until: meta.roles[m.id]?.until, ending: ending.has(m.id) }))}
        suggested={inScope.filter((u) => !memberIds.has(u.id)).map((u) => ({ id: u.id, name: u.name, note: ROLE_NOTE[u.role] }))}
        staff={staff.map((x) => ({ id: x.id, name: x.name }))} rules={comp.rows} />
      <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Agenda</h2>
      {(me || manage) && <ActionForm url="/api/cmt" fixed={{ action: "item", committeeId: c.id }} submit="Add to agenda" collapsed openLabel="+ Add an item" initial={{ meetingId: meetings[0]?.id || "" }} fields={[{ name: "title", label: "Item", type: "text", width: 320 }, { name: "summary", label: "Details", type: "textarea" }, { name: "meetingId", label: "Meeting", type: "select", options: [["", "Not yet scheduled"], ...meetings.map((m) => [m.id, new Date(m.date).toISOString().slice(0, 10)] as [string, string])] }]} />}
      {items.length === 0 && <div className="card"><p className="small-note" style={{ margin: 0 }}>Nothing on the agenda.</p></div>}
      {items.map((it, k) => {
        const { t, votes } = tallies[k];
        const mine = me ? votes.find((v) => v.memberId === me.id) : null;
        return (
          <div key={it.id} className="card" data-item={it.title}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <b>{it.title}</b>
              <span style={{ fontSize: 13 }}>{it.status === "DECIDED" ? <b style={{ color: it.outcome === "REJECTED" ? "#B3261E" : "#2F7A4D" }}>{OUTCOME_LABEL[it.outcome!]}</b> : it.outcome === "DEFERRED" ? "Deferred — still on the agenda" : "Open"}</span>
            </div>
            {it.summary && <p style={{ margin: "4px 0", fontSize: 13, whiteSpace: "pre-line" }}>{it.summary}</p>}
            {it.href && <p style={{ margin: "2px 0" }}><Link href={it.href} className="small-note">Open the draft →</Link></p>}
            {c.mode === "FULL" && <p className="small-note" style={{ margin: "4px 0" }}>{tallyLine(t)}{t.waiting.length ? ` · waiting: ${t.waiting.join(", ")}` : ""}</p>}
            {votes.map((v) => <p key={v.memberId} className="small-note" style={{ margin: "1px 0" }}>{v.name}: <b>{VOTE_LABEL[v.vote]}</b>{v.comment ? ` — ${v.comment}` : ""}</p>)}
            {it.status === "DECIDED" && <p className="small-note" style={{ margin: "4px 0" }}>Decided {it.decidedAt ? new Date(it.decidedAt).toLocaleDateString("en-GB") : ""}{it.meetingDate ? ` (meeting of ${new Date(it.meetingDate).toISOString().slice(0, 10)})` : ""}{it.decisionNote ? ` — ${it.decisionNote}` : ""}{it.signedRef ? <> · <a href={`/api/cmt/file?item=${it.id}`}>signed minutes</a></> : null}{it.councilStatus ? <> · Academic Council {it.councilStatus.toLowerCase()} {it.councilDate ? new Date(it.councilDate).toISOString().slice(0, 10) : ""}{it.councilRef ? <> (<a href={`/api/cmt/file?item=${it.id}&doc=council`}>document</a>)</> : null}</> : null}</p>}
            {it.status === "OPEN" && c.mode === "FULL" && me && <VoteForm itemId={it.id} committeeId={c.id} current={mine ? { vote: mine.vote, comment: mine.comment } : null} />}
            {it.status === "OPEN" && (convener || (!c.convenerId && user.role === "CHAIRMAN")) && <FinaliseForm itemId={it.id} convenerOnly={c.mode === "CONVENER_ONLY"} suggested={t.suggested} />}
            {it.status === "DECIDED" && c.councilStep && !it.councilStatus && manage && <div style={{ marginTop: 6 }}><PdfForm action="council" fields={{ itemId: it.id }} submit="Record" /></div>}
          </div>
        );
      })}

      <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Meetings</h2>
      <div className="card">
        {meetings.map((m) => {
          const present = new Set(JSON.parse(m.attendanceJson || "[]") as string[]);
          return (
            <div key={m.id} style={{ borderTop: "1px solid #eee", padding: "6px 0", fontSize: 13 }}>
              <b>{new Date(m.date).toISOString().slice(0, 10)}</b>{m.venue ? ` · ${m.venue}` : ""} · present: {members.filter((x) => present.has(x.id)).map((x) => x.name).join(", ") || "—"}
              <span style={{ display: "inline-flex", gap: 6, marginLeft: 8, flexWrap: "wrap" }}><a className="btn btn-secondary btn-sm" href={`/api/cmt/file?meeting=${m.id}&pdf=1`}>Minutes PDF</a>{m.minutesRef && <a className="btn btn-secondary btn-sm" href={`/api/cmt/file?meeting=${m.id}`}>Signed copy</a>}</span>
              {manage && <ActionForm url="/api/cmt" fixed={{ action: "attendance", meetingId: m.id }} submit="Save attendance" collapsed openLabel="Attendance…" initial={Object.fromEntries(members.map((x) => [`m_${x.id}`, present.has(x.id)]))} fields={members.map((x) => ({ name: `m_${x.id}`, label: x.name, type: "checkbox" as const }))} />}
              {manage && <div><PdfForm action="minutes" fields={{ meetingId: m.id }} submit="Upload signed minutes" /></div>}
            </div>
          );
        })}
        {manage && <ActionForm url="/api/cmt" fixed={{ action: "meeting", committeeId: c.id }} submit="Schedule" collapsed openLabel="+ Schedule a meeting" fields={[{ name: "date", label: "Date", type: "date", width: 150 }, { name: "venue", label: "Venue", type: "text", width: 200 }]} />}
      </div>

    </Shell>
  );
}
