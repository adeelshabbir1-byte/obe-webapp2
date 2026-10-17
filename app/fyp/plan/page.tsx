import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { fypAccess, facultyOf } from "../../../lib/fyp";
import { planTasks, progress } from "../../../lib/fypPlan";
import FypGantt from "../../../components/fyp/FypGantt";
import FypPlanEditor from "../../../components/fyp/FypPlanEditor";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString();

// The FYP Head's year plan: presentations and open house (milestones), cycle tasks with owners, and every group's status.
export default async function FypPlanPage({ searchParams }: { searchParams: { cycle?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await fypAccess(user);
  const cycles = (await prisma.fypCycle.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { createdAt: "desc" } })).filter((c) => acc.manages(c.departmentId) || acc.chairs(c.departmentId));
  if (!cycles.length) redirect("/fyp");
  const cycle = cycles.find((c) => c.id === searchParams.cycle) || cycles[0];
  const manages = acc.manages(cycle.departmentId);
  const [milestones, all, groups, people] = await Promise.all([
    prisma.fypMilestone.findMany({ where: { cycleId: cycle.id }, orderBy: { dueDate: "asc" } }),
    planTasks(cycle.id, "ALL"),
    prisma.fypGroup.findMany({ where: { cycleId: cycle.id, status: { in: ["ACTIVE", "COMPLETED"] } }, orderBy: { name: "asc" } }),
    facultyOf(acc.chairmanId, cycle.departmentId),
  ]);
  const tasks = (all || []).filter((t) => !t.groupId);
  const oh = tasks.filter((t) => t.category === "OPEN_HOUSE");
  const sups = new Map(people.map((p) => [p.id, p.name]));
  const now = new Date();
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/fyp/manage" style={{ fontSize: 13 }}>← FYP</Link>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>FYP Year Plan — {cycle.title}</h1>
      <form style={{ marginBottom: 10 }}><select name="cycle" defaultValue={cycle.id}>{cycles.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select> <button className="btn btn-secondary btn-sm">Show</button> <Link href={`/fyp/open-house?cycle=${cycle.id}`} className="act">Open house →</Link></form>
      {all === null && <div className="err">Plans are not set up yet — the Super User needs to run prisma/migration_fyp_plan.sql.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 10 }}>
        {[["Year plan tasks", progress(tasks)], ["Open house readiness", progress(oh)]].map(([l, p]) => { const q = p as ReturnType<typeof progress>; return <div key={l as string} className="card" style={{ margin: 0 }}><div className="small-note">{l as string}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{q.pct}%</div><div className="small-note">{q.done}/{q.total} done{q.overdue ? <span style={{ color: "#B3261E" }}> · {q.overdue} late</span> : ""}</div></div>; })}
        <div className="card" style={{ margin: 0 }}><div className="small-note">Groups at risk</div><div style={{ fontSize: 22, fontWeight: 700, color: groups.some((g) => g.atRisk) ? "#B3261E" : undefined }}>{groups.filter((g) => g.atRisk).length}</div><div className="small-note">of {groups.length} groups</div></div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Gantt chart</h3>
        <FypGantt items={[...milestones.map((m) => ({ label: m.title, sub: m.weightPct ? `${m.weightPct}%` : "", from: iso(m.dueDate), to: iso(m.dueDate), kind: "milestone" as const })), ...tasks.map((t) => ({ label: t.title, sub: sups.get(t.ownerId || "") || t.ownerText || "", from: iso(t.startDate), to: iso(t.endDate), kind: "task" as const, status: t.status }))].sort((a, b) => a.from.localeCompare(b.from))} />
        <p className="small-note">Diamonds: presentations and other milestones (set their dates in Manage FYP → Milestones). Bars: tasks — grey to do, blue in progress, green done, red late.</p>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tasks</h3>
        <FypPlanEditor cycleId={cycle.id} tasks={tasks.map((t) => ({ ...t, startDate: iso(t.startDate), endDate: iso(t.endDate) }))} people={people.map((p) => ({ id: p.id, name: p.name }))} canEdit={manages}
          canStatusIds={tasks.filter((t) => t.ownerId === user.id).map((t) => t.id)} templates={manages ? [{ action: "openHouseTemplate", label: "Add the standard open-house tasks" }] : []} />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Status of every FYP</h3>
        <table><thead><tr><th>Group</th><th>Supervisor</th><th>Plan progress</th><th>Late tasks</th><th>Status</th></tr></thead>
          <tbody>{groups.map((g) => { const p = progress((all || []).filter((t) => t.groupId === g.id), now); return (
            <tr key={g.id}><td><Link href={`/fyp/groups/${g.id}`}>{g.name}</Link></td><td>{sups.get(g.supervisorId || "") || "—"}</td>
              <td>{p.total ? <><div style={{ background: "#eee", height: 8, borderRadius: 4, width: 120 }}><div style={{ width: `${p.pct}%`, background: "#2E7D4F", height: 8, borderRadius: 4 }} /></div><span className="small-note">{p.done}/{p.total}</span></> : <span className="small-note">no plan yet</span>}</td>
              <td style={{ color: p.overdue ? "#B3261E" : undefined }}>{p.overdue || "—"}</td>
              <td>{g.atRisk ? <span className="badge badge-no">At risk</span> : g.status === "COMPLETED" ? <span className="badge badge-ok">Completed</span> : <span className="badge badge-neutral">On track</span>}</td></tr>); })}</tbody></table>
      </div>
    </Shell>
  );
}
