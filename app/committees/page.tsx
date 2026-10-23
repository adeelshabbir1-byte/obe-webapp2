import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, rdb, staffOf, day } from "../../lib/registers";
import { COM_HINT, KINDS, ROLES, STATUSES, canManageCommittees, canSeeCases, compliance, overdue, type Committee, type Member, type Case } from "../../lib/committees";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// Mandatory committees: composition against each HEC policy, meetings, confidential cases and the annual report.
export default async function CommitteesPage({ searchParams }: { searchParams: { id?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  let list: Committee[] | null = null;
  try { list = (await rdb.committee.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { kind: "asc" } })) as Committee[]; } catch { list = null; }
  const members = (await rdb.committeeMember.findMany({ where: { committeeId: { in: (list || []).map((c) => c.id).concat(["none"]) } } }).catch(() => [])) as Member[];
  const mine = new Set(members.filter((m) => m.userId === w.id && !m.toDate).map((m) => m.committeeId));
  if (!(canManageCommittees(w) || w.leader || mine.size)) redirect("/dashboard");
  const manage = canManageCommittees(w);
  const staff = await staffOf(w.chairmanId);
  const sel = (list || []).find((c) => c.id === searchParams.id) || null;
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Committees</h1>
    <p className="small-note" style={{ marginBottom: 10 }}>The committees HEC&apos;s policies require: who is on them and for how long, their meetings, the cases they handled (confidential) and the annual report.</p>
    <HowCalculated shows="Each committee is checked against its policy.">
      <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>{Object.entries(KINDS).filter(([k]) => k !== "OTHER").map(([k, v]) => <li key={k}><b>{v.label}</b> ({v.policy}): at least {v.minMembers} member(s){v.needsWoman ? ", at least one a woman" : ""}{v.daysToDecide ? `; cases decided within ${v.daysToDecide} days` : ""}.</li>)}
        <li>Cases carry no names. Only the committee&apos;s members and the institute head see them; others see counts. The policy limits are as we know them — check against the current notification.</li></ul>
    </HowCalculated>
    {list === null && <div className="err">{COM_HINT}</div>}{x}</Shell>;

  if (!sel) return shell(<>
    {manage && <div className="card"><h3 style={{ marginTop: 0 }}>Set up a committee</h3><ActionForm url="/api/committees" fixed={{ action: "create" }} submit="Set up" collapsed openLabel="New committee" fields={[{ name: "kind", label: "Kind", type: "select", options: Object.entries(KINDS).map(([k, v]) => [k, v.label] as [string, string]) }, { name: "name", label: "Name", width: 240 }, { name: "policyRef", label: "Notification / policy reference", width: 240 }, { name: "termStart", label: "Term from", type: "date" }, { name: "termEnd", label: "Term to", type: "date" }]} /></div>}
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Committee</th><th>Members</th><th>Term</th><th>Against the policy</th></tr></thead>
        <tbody>{(list || []).map((c) => { const comp = compliance(c, members.filter((m) => m.committeeId === c.id)); return (
          <tr key={c.id}><td><a href={`?id=${c.id}`}><b>{c.name}</b></a><div className="small-note" style={{ margin: 0 }}>{KINDS[c.kind]?.label}</div></td><td>{comp.current.length}</td><td>{day(c.termStart)} – {day(c.termEnd)}</td><td style={{ color: comp.ok ? "#1E6B3A" : "#B3261E", fontWeight: 700 }}>{comp.ok ? "✓ meets" : comp.issues.join("; ")}</td></tr>); })}
          {!(list || []).length && <tr><td colSpan={4}>No committee set up yet. The harassment inquiry committee and a disability focal person are required by HEC.</td></tr>}</tbody></table>
    </div>
  </>);

  const ms = members.filter((m) => m.committeeId === sel.id);
  const comp = compliance(sel, ms);
  const seeCases = await canSeeCases(w, sel.id);
  const meetings = (await rdb.committeeMeeting.findMany({ where: { committeeId: sel.id }, orderBy: { date: "desc" } })) as { id: string; date: Date; agenda: string | null; decisions: string | null; attendees: number | null }[];
  const cases = (await rdb.committeeCase.findMany({ where: { committeeId: sel.id }, orderBy: { receivedAt: "desc" } })) as Case[];
  const k = KINDS[sel.kind] || KINDS.OTHER;
  const year = new Date().getFullYear();
  return shell(<>
    <p className="no-print" style={{ margin: "0 0 8px" }}><a href="/committees">← All committees</a></p>
    <div className="card" style={{ borderLeft: `5px solid ${comp.ok ? "#1E6B3A" : "#B3261E"}` }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{sel.name}</h2>
      <p className="small-note" style={{ margin: 0 }}>{k.label}{sel.policyRef || k.policy ? ` · ${sel.policyRef || k.policy}` : ""} · term {day(sel.termStart)} – {day(sel.termEnd)}</p>
      <p style={{ fontWeight: 700, color: comp.ok ? "#1E6B3A" : "#B3261E", margin: "6px 0" }}>{comp.ok ? "✓ Composition meets the policy" : `✗ ${comp.issues.join("; ")}`}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="no-print">
        <a className="btn btn-brass btn-sm" href={`/api/committees?report=${sel.id}&year=${year}`}>⬇ Annual report {year} (Word)</a>
        <a className="btn btn-secondary btn-sm" href={`/api/committees?report=${sel.id}&year=${year - 1}`}>⬇ {year - 1}</a>
        {manage && <ActionForm url="/api/committees" fixed={{ action: "term", id: sel.id }} submit="Save" collapsed openLabel="Change term" initial={{ termStart: sel.termStart ? new Date(sel.termStart).toISOString().slice(0, 10) : "", termEnd: sel.termEnd ? new Date(sel.termEnd).toISOString().slice(0, 10) : "", policyRef: sel.policyRef || "" }} fields={[{ name: "termStart", label: "From", type: "date" }, { name: "termEnd", label: "To", type: "date" }, { name: "policyRef", label: "Notification", width: 220 }]} />}
      </div>
    </div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Members</h3>
      <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Name</th><th>Role</th><th>Gender</th><th>From</th><th>To</th><th /></tr></thead>
        <tbody>{ms.map((m) => <tr key={m.id} style={{ opacity: m.toDate ? 0.55 : 1 }}><td>{m.name}{m.organisation ? <div className="small-note" style={{ margin: 0 }}>{m.organisation}</div> : null}</td><td>{ROLES[m.role] || m.role}</td><td>{m.gender || "—"}</td><td>{day(m.fromDate)}</td><td>{m.toDate ? day(m.toDate) : "current"}</td><td>{manage && !m.toDate && <ActionButton url="/api/committees" body={{ action: "endMember", memberId: m.id }} label="End membership" className="act" confirmText={`End ${m.name}'s membership today?`} />}</td></tr>)}
          {!ms.length && <tr><td colSpan={6}>No members yet.</td></tr>}</tbody></table>
      {manage && <ActionForm url="/api/committees" fixed={{ action: "member", id: sel.id }} submit="Add" collapsed openLabel="Add a member" fields={[{ name: "userId", label: "Staff member", type: "select", options: staff.map((s) => [s.id, s.name] as [string, string]) }, { name: "name", label: "…or an outside member's name", width: 180 }, { name: "organisation", label: "Organisation", width: 160 }, { name: "role", label: "Role", type: "select", options: Object.entries(ROLES) }, { name: "gender", label: "Gender", type: "select", options: [["Female", "Female"], ["Male", "Male"]] }, { name: "fromDate", label: "From", type: "date" }]} />}
    </div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Meetings</h3>
      <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Date</th><th>Agenda</th><th>Decisions</th><th>Present</th></tr></thead>
        <tbody>{meetings.map((m) => <tr key={m.id}><td>{day(m.date)}</td><td>{m.agenda || "—"}</td><td>{m.decisions || "—"}</td><td>{m.attendees ?? "—"}</td></tr>)}{!meetings.length && <tr><td colSpan={4}>No meeting recorded.</td></tr>}</tbody></table>
      {(manage || mine.has(sel.id)) && <ActionForm url="/api/committees" fixed={{ action: "meeting", id: sel.id }} submit="Add" collapsed openLabel="Record a meeting" fields={[{ name: "date", label: "Date", type: "date" }, { name: "attendees", label: "Members present", type: "number", width: 80 }, { name: "agenda", label: "Agenda", width: 240 }, { name: "decisions", label: "Decisions", width: 260 }]} />}
    </div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Cases {seeCases ? "" : "(counts only)"}</h3>
      {!seeCases ? <p style={{ fontSize: 13 }}>{cases.length} case(s) in total; {cases.filter((c) => !["CLOSED", "DECIDED"].includes(c.status)).length} open{cases.some((c) => overdue(sel, c)) ? `, ${cases.filter((c) => overdue(sel, c)).length} past the time limit` : ""}. Details are seen only by the committee&apos;s members.</p> : <>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Case</th><th>Received</th><th>Category</th><th>Status</th><th>Outcome</th><th /></tr></thead>
          <tbody>{cases.map((c) => { const late = overdue(sel, c); return <tr key={c.id}><td><b>{c.caseNo}</b>{c.notes && <div className="small-note" style={{ margin: 0 }}>{c.notes}</div>}</td><td>{day(c.receivedAt)}</td><td>{c.category}</td><td style={{ fontWeight: 700, color: late ? "#B3261E" : ["CLOSED", "DECIDED"].includes(c.status) ? "#1E6B3A" : "#9A3412" }}>{STATUSES[c.status]}{late ? ` — over ${k.daysToDecide} days` : ""}{c.closedAt ? <div className="small-note" style={{ margin: 0 }}>{day(c.closedAt)}</div> : null}</td><td style={{ fontSize: 12.5 }}>{c.outcome || "—"}</td>
            <td>{!["CLOSED"].includes(c.status) && <ActionForm url="/api/committees" fixed={{ action: "caseUpdate", caseId: c.id }} submit="Save" collapsed openLabel="Update" initial={{ status: c.status, outcome: c.outcome || "", notes: c.notes || "" }} fields={[{ name: "status", label: "Status", type: "select", options: Object.entries(STATUSES) }, { name: "outcome", label: "Outcome (no names)", width: 220 }, { name: "notes", label: "Notes", width: 200 }]} />}</td></tr>; })}
            {!cases.length && <tr><td colSpan={6}>No cases.</td></tr>}</tbody></table>
        <ActionForm url="/api/committees" fixed={{ action: "case", id: sel.id }} submit="Record" collapsed openLabel="Record a case" fields={[{ name: "category", label: "Category", type: "select", options: k.categories.map((x) => [x, x] as [string, string]) }, { name: "receivedAt", label: "Received on", type: "date" }, { name: "notes", label: "Notes (no names)", width: 260 }]} />
      </>}
    </div>
  </>);
}
