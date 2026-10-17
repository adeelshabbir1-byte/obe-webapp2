import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { erpAccess, edb } from "../../lib/erp";
import { progress } from "../../lib/fypPlan";
import { ActionForm } from "../../components/fyp/FypClient";
import { UNI_TEMPLATES } from "../../lib/uniPlanTemplates";

export const dynamic = "force-dynamic";

// University planner: plans of every office, each a Gantt with working days, holidays, dependencies and the critical path.
export default async function PlansPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const { chairmanId } = await erpAccess(user);
  const plans = ((await edb.uniPlan.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" } }).catch(() => null)) as { id: string; title: string; area: string | null; ownerId: string | null; createdAt: Date }[] | null);
  const tasks = plans?.length ? ((await edb.fypPlanTask.findMany({ where: { cycleId: { in: plans.map((p) => p.id) } } }).catch(() => [])) as { cycleId: string; status: string; endDate: Date; startDate: Date }[]) : [];
  const owners = plans?.length ? await edb.user.findMany({ where: { id: { in: plans.map((p) => p.ownerId).filter(Boolean) } }, select: { id: true, name: true } }) as { id: string; name: string }[] : [];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>University Planner</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>Plan any activity — semester start, admissions campaign, convocation, accreditation visit — as tasks with working days and dependencies. Weekends and holidays (Academic Calendar) are skipped automatically and the critical path is shown.</p>
      {plans === null ? <div className="err">Not set up yet — run prisma/migration_erp.sql in Supabase.</div> : (
        <>
          <div className="card">
            <ActionForm url="/api/plans" fixed={{ action: "createPlan" }} submit="Create plan" collapsed openLabel="New plan" initial={{ template: "", startDate: new Date().toISOString().slice(0, 10) }}
              fields={[{ name: "title", label: "Plan name", width: 260 }, { name: "area", label: "Office / area", width: 160 }, { name: "template", label: "Start from", type: "select", options: [["", "Empty plan"], ...Object.entries(UNI_TEMPLATES).map(([k, v]) => [k, v.label] as [string, string])] }, { name: "startDate", label: "Starts", type: "date" }]} />
          </div>
          <div className="card">
            {plans.length === 0 ? <p style={{ margin: 0 }}>No plans yet.</p> : (
              <table><thead><tr><th>Plan</th><th>Office</th><th>Owner</th><th>Dates</th><th>Progress</th></tr></thead>
                <tbody>{plans.map((p) => { const ts = tasks.filter((t) => t.cycleId === p.id) as never[]; const pr = progress(ts); const d = tasks.filter((t) => t.cycleId === p.id);
                  return <tr key={p.id}><td><Link href={`/plans/${p.id}`}><b>{p.title}</b></Link></td><td>{p.area || "—"}</td><td>{owners.find((o) => o.id === p.ownerId)?.name || "—"}</td>
                    <td className="small-note">{d.length ? `${new Date(Math.min(...d.map((x) => x.startDate.getTime()))).toISOString().slice(0, 10)} → ${new Date(Math.max(...d.map((x) => x.endDate.getTime()))).toISOString().slice(0, 10)}` : "—"}</td>
                    <td>{pr.total ? `${pr.pct}% (${pr.done}/${pr.total})${pr.overdue ? ` · ${pr.overdue} late` : ""}` : "—"}</td></tr>; })}</tbody></table>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
