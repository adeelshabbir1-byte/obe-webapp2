import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { SocietyForm, SocietyRecords } from "../../components/SocietyEditor";
import { activitiesScope, canEditSociety, EVENT_CATEGORIES, POSITIONS, SOCIETY_CATEGORIES, sessionNow, societiesOf } from "../../lib/studentActivities";
import { appraiseesFor } from "../../lib/appraisal";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import { AWARD_KINDS, engagementSummary, EVENT_STATUS } from "../../lib/engagement";

export const dynamic = "force-dynamic";

// Student societies and clubs: who runs them, their office bearers each session, and every event they hold.
export default async function StudentActivitiesPage({ searchParams }: { searchParams: { society?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const scope = await activitiesScope(user);
  if (!scope) redirect("/dashboard");
  let data: Awaited<ReturnType<typeof societiesOf>> | null = null;
  try { data = await societiesOf(scope.chairmanId); } catch { data = null; }
  const session = sessionNow();
  const yearStart = new Date(Date.UTC(parseInt(session.slice(0, 4), 10), 7, 1));
  const [people, departments] = await Promise.all([
    scope.manageAll ? appraiseesFor(user).then((r) => r.people) : Promise.resolve([]),
    prisma.department.findMany({ where: { chairmanId: scope.chairmanId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const advisorIds = Array.from(new Set((data?.societies || []).map((s) => s.advisorId).filter((x): x is string => !!x)));
  const advisors = new Map((await prisma.user.findMany({ where: { id: { in: advisorIds.concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const selected = data?.societies.find((s) => s.id === searchParams.society) || null;
  const [members, events] = selected
    ? await Promise.all([
      prisma.societyMember.findMany({ where: { societyId: selected.id }, orderBy: [{ term: "desc" }, { createdAt: "asc" }] }),
      prisma.societyEvent.findMany({ where: { societyId: selected.id }, orderBy: { eventDate: "desc" } }),
    ])
    : [[], []];
  const eventsThisSession = (data?.events || []).filter((e) => e.eventDate >= yearStart);
  const participants = eventsThisSession.reduce((n, e) => n + (e.participants || 0), 0);
  const mine = (data?.societies || []).filter((s) => s.advisorId === user.id);
  // Event proposals from office bearers: Student Affairs decides; advisors see their own societies' proposals.
  const visibleSocieties = (data?.societies || []).filter((s) => scope.manageAll || s.advisorId === user.id);
  const proposals = visibleSocieties.length ? await prisma.societyEvent.findMany({ where: { societyId: { in: visibleSocieties.map((s) => s.id) }, status: "PROPOSED" }, orderBy: { eventDate: "asc" } }).catch(() => []) : [];
  const rooms = await prisma.room.findMany({ where: { chairmanId: scope.chairmanId }, select: { id: true, name: true, capacity: true }, orderBy: { name: "asc" } });
  const proposers = new Map((await prisma.student.findMany({ where: { id: { in: proposals.map((p) => p.proposedByStudentId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((x) => [x.id, x]));
  const engagement = data && !selected ? await engagementSummary(scope.chairmanId, session).catch(() => null) : null;
  const societyName = new Map((data?.societies || []).map((s) => [s.id, s.name]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Student Societies</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14, maxWidth: 900 }}>
        Every student club and society, its faculty advisor, its office bearers each session and the events it holds — the record of extra-curricular
        activities accreditation asks for. Student Affairs keeps the list of societies; each society&apos;s advisor keeps its office bearers and events.
      </p>
      {!data && <div className="err">The student society tables are not up to date — run prisma/migration_oct2026_features.sql and prisma/migration_master_spec.sql in Supabase.</div>}
      {data && !selected && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[["Active societies", data.societies.filter((s) => s.isActive).length], [`Events in ${session}`, eventsThisSession.length], [`Participants in ${session}`, participants.toLocaleString("en-US")], ["Office bearers recorded", data.members.reduce((n, m) => n + m._count._all, 0)]].map(([l, v]) => (
              <div key={String(l)} className="stat stat-neutral" style={{ padding: "12px 14px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>{l}</div></div>
            ))}
          </div>
          {mine.length > 0 && <p style={{ fontSize: 13 }}>You advise: {mine.map((s, i) => <span key={s.id}>{i ? ", " : ""}<Link href={`/student-activities?society=${s.id}`}><b>{s.name}</b></Link></span>)}</p>}
          {proposals.length > 0 && (
            <div className="card" style={{ borderLeft: "4px solid var(--brass)" }}>
              <h3 style={{ marginTop: 0 }}>Event proposals waiting ({proposals.length})</h3>
              {proposals.map((e) => {
                const by = e.proposedByStudentId ? proposers.get(e.proposedByStudentId) : null;
                return (
                  <div key={e.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                    <div><b>{e.title}</b> <span className="small-note">· {societyName.get(e.societyId)} · {e.category} · {e.eventDate.toISOString().slice(0, 10)}{e.startTime ? ` ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : ""}</span></div>
                    <div className="small-note">{by ? `Proposed by ${by.name} (${by.rollNumber})` : ""}{e.participants ? ` · ${e.participants} expected` : ""}{e.venue ? ` · wants ${e.venue}` : ""}{e.budgetRequested ? ` · asks PKR ${Math.round(e.budgetRequested).toLocaleString("en-US")}` : ""}{e.equipment ? ` · needs ${e.equipment}` : ""}</div>
                    {e.description && <p style={{ fontSize: 12.5, margin: "4px 0" }}>{e.description}</p>}
                    {scope.manageAll ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <ActionForm url="/api/student-activities" fixed={{ entity: "decision", societyId: e.societyId, eventId: e.id, decision: "APPROVE" }} submit="Approve" collapsed openLabel="Approve…" done="Approved."
                          initial={{ roomId: "", budget: e.budgetRequested ?? "", equipment: e.equipment || "", note: "" }}
                          fields={[{ name: "roomId", label: "Room", type: "select", options: [["", "— no room / outside —"], ...rooms.map((r) => [r.id, `${r.name} (${r.capacity})`] as [string, string])], width: 200 }, { name: "budget", label: "Budget approved (PKR)", type: "number", width: 140 }, { name: "equipment", label: "Equipment provided", width: 240 }, { name: "note", label: "Note to the society", width: 240 }]} />
                        <ActionButton url="/api/student-activities" body={{ entity: "decision", societyId: e.societyId, eventId: e.id, decision: "REJECT" }} label="Decline" className="btn btn-secondary btn-sm" askNote="Why is it not approved?" noteRequired />
                      </div>
                    ) : <p className="small-note" style={{ margin: 0 }}>Student Affairs decides on proposals.</p>}
                  </div>
                );
              })}
            </div>
          )}
          {engagement && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Co-curricular engagement in {session}</h3>
              <p style={{ fontSize: 13, margin: "0 0 8px" }}><b>{engagement.engaged}</b> of {engagement.enrolled} students ({engagement.enrolled ? Math.round((100 * engagement.engaged) / engagement.enrolled) : 0}%) have engagement points this session.</p>
              {engagement.top.length > 0 && (
                <table>
                  <thead><tr><th>Student</th><th>Program</th><th>Points</th></tr></thead>
                  <tbody>{engagement.top.map((t, i) => <tr key={i}><td>{t.name}<div className="small-note">{t.rollNumber}</div></td><td className="small-note">{t.batch?.degreeProgram}</td><td><b>{t.points}</b></td></tr>)}</tbody>
                </table>
              )}
            </div>
          )}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Societies</h3>
              {scope.manageAll && <SocietyForm people={people} categories={SOCIETY_CATEGORIES} departments={departments} />}
            </div>
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Society</th><th>Type</th><th>Faculty advisor</th><th>Members</th><th>Events ({session})</th><th></th></tr></thead>
              <tbody>
                {data.societies.length === 0 && <tr><td colSpan={6} className="small-note">No societies recorded yet.</td></tr>}
                {data.societies.map((s) => (
                  <tr key={s.id} style={s.isActive ? undefined : { opacity: 0.6 }}>
                    <td><b>{s.name}</b>{!s.isActive && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Inactive</span>}{s.description && <div className="small-note">{s.description.slice(0, 140)}</div>}</td>
                    <td>{SOCIETY_CATEGORIES[s.category] || s.category}</td>
                    <td>{s.advisorId ? advisors.get(s.advisorId) || "—" : <span className="small-note">none yet</span>}</td>
                    <td>{data!.members.find((m) => m.societyId === s.id)?._count._all || 0}</td>
                    <td>{eventsThisSession.filter((e) => e.societyId === s.id).length}</td>
                    <td><Link className="act act-primary" href={`/student-activities?society=${s.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {data && selected && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <h2 style={{ fontSize: 19, margin: 0 }}>{selected.name}</h2>
              <p className="small-note" style={{ margin: "2px 0 0" }}>{SOCIETY_CATEGORIES[selected.category] || selected.category}{selected.advisorId ? ` · advisor: ${advisors.get(selected.advisorId)}` : ""}{selected.foundedYear ? ` · since ${selected.foundedYear}` : ""}{selected.departmentId ? ` · ${departments.find((d) => d.id === selected.departmentId)?.name || ""}` : ""}</p>
              {selected.description && <p style={{ fontSize: 13, maxWidth: 800 }}>{selected.description}</p>}
            </div>
            <Link className="btn btn-secondary btn-sm" href="/student-activities">← All societies</Link>
          </div>
          {scope.manageAll && <SocietyForm society={{ id: selected.id, name: selected.name, category: selected.category, advisorId: selected.advisorId, departmentId: selected.departmentId, description: selected.description, foundedYear: selected.foundedYear, isActive: selected.isActive, societyType: selected.societyType, constitutedOn: selected.constitutedOn ? selected.constitutedOn.toISOString().slice(0, 10) : null, memberCount: selected.memberCount }} people={people} categories={SOCIETY_CATEGORIES} departments={departments} />}
          <SocietyRecords
            societyId={selected.id} canEdit={canEditSociety(user, scope.manageAll, selected)} session={session} positions={POSITIONS} eventCategories={EVENT_CATEGORIES}
            members={members.map((m) => ({ id: m.id, name: m.name, rollNumber: m.rollNumber, position: m.position, term: m.term }))}
            events={events.filter((e) => !["PROPOSED", "REJECTED", "CANCELLED"].includes(e.status)).map((e) => ({ id: e.id, title: e.title, category: e.category, eventDate: e.eventDate.toISOString().slice(0, 10), venue: e.venue, participants: e.participants, guests: e.guests, description: e.description, outcome: e.outcome, budget: e.budget }))}
          />
          {canEditSociety(user, scope.manageAll, selected) && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Attendance and engagement points</h3>
                <ActionButton url="/api/student-activities" body={{ entity: "leadership", societyId: selected.id, term: session }} label={`Give office points for ${session}`} className="btn btn-secondary btn-sm" done="Office points given." />
              </div>
              <p className="small-note">Take attendance after an event: paste the roll numbers and say what the students did. Points: {Object.values(AWARD_KINDS).map((k) => `${k.label.toLowerCase()} ${k.points}`).join(", ")}; office bearers get points for their office each session.</p>
              {events.filter((e) => ["APPROVED", "COMPLETED"].includes(e.status)).length === 0 ? <p className="small-note">No approved events yet.</p> : (
                <table>
                  <thead><tr><th>Event</th><th>Status</th><th>Head-count</th><th /></tr></thead>
                  <tbody>{events.filter((e) => ["APPROVED", "COMPLETED"].includes(e.status)).map((e) => (
                    <tr key={e.id}>
                      <td><b>{e.title}</b><div className="small-note">{e.eventDate.toISOString().slice(0, 10)}{e.roomId ? ` · ${roomName.get(e.roomId)}` : e.venue ? ` · ${e.venue}` : ""}</div></td>
                      <td><span className={`badge ${EVENT_STATUS[e.status]?.[1] || "badge-neutral"}`}>{EVENT_STATUS[e.status]?.[0]}</span></td>
                      <td>{e.participants ?? "—"}</td>
                      <td>{e.eventDate.getTime() <= Date.now() + 86400000 && (
                        <ActionForm url="/api/student-activities" fixed={{ entity: "attendance", societyId: selected.id, eventId: e.id }} submit="Record" collapsed openLabel="Take attendance" done="Recorded."
                          initial={{ kind: "ATTENDED" }} fields={[{ name: "kind", label: "They", type: "select", options: Object.entries(AWARD_KINDS).map(([k, v]) => [k, v.label]), width: 180 }, { name: "rollNumbers", label: "Roll numbers", type: "textarea" }]} />
                      )}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
