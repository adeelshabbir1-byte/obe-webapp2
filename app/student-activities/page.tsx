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

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Student Societies</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14, maxWidth: 900 }}>
        Every student club and society, its faculty advisor, its office bearers each session and the events it holds — the record of extra-curricular
        activities accreditation asks for. Student Affairs keeps the list of societies; each society&apos;s advisor keeps its office bearers and events.
      </p>
      {!data && <div className="err">The student society tables are not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}
      {data && !selected && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[["Active societies", data.societies.filter((s) => s.isActive).length], [`Events in ${session}`, eventsThisSession.length], [`Participants in ${session}`, participants.toLocaleString("en-US")], ["Office bearers recorded", data.members.reduce((n, m) => n + m._count._all, 0)]].map(([l, v]) => (
              <div key={String(l)} className="stat stat-neutral" style={{ padding: "12px 14px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>{l}</div></div>
            ))}
          </div>
          {mine.length > 0 && <p style={{ fontSize: 13 }}>You advise: {mine.map((s, i) => <span key={s.id}>{i ? ", " : ""}<Link href={`/student-activities?society=${s.id}`}><b>{s.name}</b></Link></span>)}</p>}
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
          {scope.manageAll && <SocietyForm society={{ id: selected.id, name: selected.name, category: selected.category, advisorId: selected.advisorId, departmentId: selected.departmentId, description: selected.description, foundedYear: selected.foundedYear, isActive: selected.isActive }} people={people} categories={SOCIETY_CATEGORIES} departments={departments} />}
          <SocietyRecords
            societyId={selected.id} canEdit={canEditSociety(user, scope.manageAll, selected)} session={session} positions={POSITIONS} eventCategories={EVENT_CATEGORIES}
            members={members.map((m) => ({ id: m.id, name: m.name, rollNumber: m.rollNumber, position: m.position, term: m.term }))}
            events={events.map((e) => ({ id: e.id, title: e.title, category: e.category, eventDate: e.eventDate.toISOString().slice(0, 10), venue: e.venue, participants: e.participants, guests: e.guests, description: e.description, outcome: e.outcome, budget: e.budget }))}
          />
        </>
      )}
    </Shell>
  );
}
