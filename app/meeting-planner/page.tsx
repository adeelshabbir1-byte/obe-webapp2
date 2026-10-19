import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { MEETING_KINDS, MEETING_ROLES, fileScope } from "../../lib/evidenceFiles";
import { planned, inviteList, myActions, parseInv, MEET_HINT } from "../../lib/meetingsPlus";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meeting Planner" };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function MeetingPlannerPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const scope = await fileScope(user);
  const organizer = [...MEETING_ROLES, "STUDENT_AFFAIRS"].includes(user.role);
  let list: Awaited<ReturnType<typeof planned>> | null = null;
  try { list = await planned(scope.chairmanId, null); } catch { list = null; }
  const mine = await myActions(user.id);
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: scope.chairmanId }, select: { id: true } });
  const [people, programs, batches] = organizer ? await Promise.all([
    prisma.user.findMany({ where: { isActive: true, isVisitingPlaceholder: false, OR: [{ managedById: scope.chairmanId }, { managedById: { in: leads.map((l) => l.id).concat("none") } }, { id: scope.chairmanId }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.alumni.findMany({ where: { chairmanId: scope.chairmanId }, select: { degreeProgram: true }, distinct: ["degreeProgram"] }),
    prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id).concat("none") }, students: { some: { status: "ACTIVE" } } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { batchName: "asc" }] }),
  ]) : [[], [], []];
  const pick = people.map((p) => [p.id, p.name] as [string, string]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const batchName = new Map(batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`]));
  const today = new Date(iso(new Date()) + "T00:00:00Z");
  const url = "/api/meeting-planner";
  const upcoming = (list || []).filter((m) => m.extra.status === "SCHEDULED" && m.meetingDate >= today).sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime());
  const rest = (list || []).filter((m) => !upcoming.includes(m));

  const card = async (m: NonNullable<typeof list>[number]) => {
    const inv = parseInv(m.extra.inviteesJson);
    const l = organizer ? await inviteList(scope.chairmanId, inv) : { alumni: [], students: [] };
    const emails = l.alumni.map((a) => a.email).filter(Boolean).join(",");
    return (
      <div key={m.id} className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
          <b>{m.title}</b><span className="small-note">{MEETING_KINDS[m.kind] || m.kind} · {iso(m.meetingDate)}{m.extra.startTime ? ` ${m.extra.startTime}` : ""}{m.extra.venue ? ` · ${m.extra.venue}` : ""}</span>
          <span className={`badge ${m.extra.status === "HELD" ? "badge-ok" : m.extra.status === "CANCELLED" ? "badge-neutral" : "badge-warn"}`}>{m.extra.status === "HELD" ? "Held" : m.extra.status === "CANCELLED" ? "Cancelled" : "Scheduled"}</span>
        </div>
        {m.extra.agenda && <p style={{ fontSize: 12.5, whiteSpace: "pre-wrap", margin: "6px 0" }}><b>Agenda:</b> {m.extra.agenda}</p>}
        <p className="small-note" style={{ margin: "4px 0" }}>Invited: {[inv.faculty === "ALL" ? "all faculty" : inv.faculty === "PROGRAM" ? "the program's faculty" : "", inv.alumniProgram ? `${l.alumni.length || ""} alumni of ${inv.alumniProgram}` : "", inv.batchId ? `students of ${batchName.get(inv.batchId) || "a batch"}${l.students.length ? ` (${l.students.length})` : ""}` : "", inv.external || ""].filter(Boolean).join(" · ") || "—"}
          {emails && <> · <a href={`mailto:?bcc=${encodeURIComponent(emails)}&subject=${encodeURIComponent(`Invitation: ${m.title}`)}&body=${encodeURIComponent(`You are invited to ${m.title} on ${iso(m.meetingDate)}${m.extra.startTime ? ` at ${m.extra.startTime}` : ""}${m.extra.venue ? `, ${m.extra.venue}` : ""}.\n\n${m.extra.agenda || ""}`)}`}>Email the alumni</a></>}
        </p>
        {organizer && (l.alumni.length > 0 || l.students.length > 0) && (
          <details style={{ fontSize: 12.5 }}><summary style={{ cursor: "pointer" }}>Invitation / attendance sheet</summary>
            <ol>{l.alumni.map((a, i) => <li key={`a${i}`}>{a.name} ({a.graduationYear}){a.email ? ` — ${a.email}` : ""}</li>)}{l.students.map((s, i) => <li key={`s${i}`}>{s.name} — {s.rollNumber}</li>)}</ol>
          </details>
        )}
        {m.decisions && <p style={{ fontSize: 12.5, whiteSpace: "pre-wrap", margin: "6px 0" }}><b>Minutes:</b> {m.decisions}{m.attendees ? <><br /><b>Present:</b> {m.attendees}</> : null}</p>}
        {m.actions.length > 0 && (
          <table style={{ fontSize: 12.5, marginTop: 4 }}><thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{m.actions.map((a) => <tr key={a.id}><td>{a.text}</td><td>{nameOf.get(a.ownerId || "") || "—"}</td><td style={{ color: a.status !== "DONE" && a.dueDate && a.dueDate < today ? "#B3261E" : undefined }}>{a.dueDate ? iso(a.dueDate) : "—"}</td><td>{a.status === "DONE" ? "Done" : (organizer || a.ownerId === user.id) ? <ActionButton url={url} body={{ action: "actionDone", id: a.id }} label="Mark done" className="btn btn-ghost btn-sm" /> : "Open"}</td></tr>)}</tbody>
          </table>
        )}
        {organizer && m.extra.status !== "CANCELLED" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <ActionForm url={url} fixed={{ action: "minutes", meetingId: m.id }} collapsed openLabel={m.decisions ? "Edit minutes" : "Record minutes"} submit="Save minutes" initial={{ attended: m.attendees || "", minutes: m.decisions || "" }} fields={[{ name: "attended", label: "Who came (names, one per line)", type: "textarea", full: true }, { name: "minutes", label: "Minutes / decisions", type: "textarea", full: true }]} />
            <ActionForm url={url} fixed={{ action: "addAction", meetingId: m.id }} collapsed openLabel="+ Action item" submit="Add" fields={[{ name: "text", label: "What", width: 260 }, { name: "ownerId", label: "Owner", type: "select", options: [["", "—"], ...pick] }, { name: "dueDate", label: "Due", type: "date" }]} />
            {m.extra.status === "SCHEDULED" && <ActionButton url={url} body={{ action: "cancel", meetingId: m.id }} label="Cancel meeting" className="btn btn-ghost btn-sm" confirmText="Cancel this meeting?" />}
          </div>
        )}
      </div>
    );
  };

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Meeting Planner</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Alumni, student, faculty and board meetings: schedule with an agenda and invitations, then record who came, the minutes and action items. Minutes also appear under <Link href="/meetings">Meetings</Link> as SAR evidence.</p>
      {list === null && <div className="err">{MEET_HINT}</div>}
      {mine.length > 0 && (
        <div className="card"><h3 style={{ marginTop: 0 }}>My action items</h3>
          <ul style={{ fontSize: 13, margin: 0 }}>{mine.map((a) => <li key={a.id}>{a.text} <span className="small-note">— {a.meetingTitle}{a.dueDate ? `, due ${iso(a.dueDate)}` : ""}</span> <ActionButton url="/api/meeting-planner" body={{ action: "actionDone", id: a.id }} label="Done" className="btn btn-ghost btn-sm" /></li>)}</ul>
        </div>
      )}
      {organizer && list !== null && (
        <div className="card"><h3 style={{ marginTop: 0 }}>Schedule a meeting</h3>
          <ActionForm url={url} fixed={{ action: "schedule" }} submit="Schedule and notify" initial={{ kind: "ALUMNI", faculty: "NONE" }} fields={[
            { name: "kind", label: "Type", type: "select", options: Object.entries(MEETING_KINDS) as [string, string][] }, { name: "title", label: "Title", width: 240 },
            { name: "date", label: "Date", type: "date" }, { name: "startTime", label: "Time", width: 70, placeholder: "11:00" }, { name: "venue", label: "Venue", width: 150 },
            ...(scope.leads.length ? [{ name: "leadId", label: "Program", type: "select" as const, options: [["", "Whole department"], ...scope.leads.map((l) => [l.id, l.leadProgram || l.name] as [string, string])] as [string, string][] }] : []),
            { name: "faculty", label: "Faculty invited", type: "select", options: [["NONE", "None"], ["PROGRAM", "Program's faculty"], ["ALL", "All faculty"]] },
            { name: "alumniProgram", label: "Alumni of", type: "select", options: [["", "—"], ...programs.map((p) => [p.degreeProgram, p.degreeProgram] as [string, string])] },
            { name: "batchId", label: "Students of", type: "select", options: [["", "—"], ...batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`] as [string, string])] },
            { name: "external", label: "Others (employers, guests)", width: 240 }, { name: "agenda", label: "Agenda", type: "textarea", full: true },
          ]} />
        </div>
      )}
      {upcoming.length > 0 && <h3>Coming up</h3>}
      {await Promise.all(upcoming.map(card))}
      {rest.length > 0 && <h3>Held and past</h3>}
      {await Promise.all(rest.slice(0, 30).map(card))}
    </Shell>
  );
}
