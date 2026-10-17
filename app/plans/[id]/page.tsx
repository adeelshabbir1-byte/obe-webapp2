import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { erpAccess, edb } from "../../../lib/erp";
import { facultyOf } from "../../../lib/fyp";
import { workCalendar } from "../../../lib/workdays";
import { analyse } from "../../../lib/fypSchedule";
import { progress, type PlanTask } from "../../../lib/fypPlan";
import FypGantt from "../../../components/fyp/FypGantt";
import FypPlanEditor from "../../../components/fyp/FypPlanEditor";
import { ActionButton } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const { chairmanId } = await erpAccess(user);
  const plan = (await edb.uniPlan.findFirst({ where: { id: params.id, chairmanId } }).catch(() => null)) as { id: string; title: string; area: string | null; ownerId: string | null; createdById: string } | null;
  if (!plan) notFound();
  const tasks = (await edb.fypPlanTask.findMany({ where: { cycleId: plan.id }, orderBy: [{ startDate: "asc" }, { orderIndex: "asc" }] })) as PlanTask[];
  const cal = await workCalendar(chairmanId);
  const an = analyse(cal, tasks as never);
  const people = await facultyOf(chairmanId);
  const canEdit = user.role === "CHAIRMAN" || plan.ownerId === user.id || plan.createdById === user.id;
  const pr = progress(tasks);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/plans" style={{ fontSize: 13 }}>← University Planner</Link>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>{plan.title}</h1>
      <p className="small-note">{plan.area || ""} · {pr.pct}% done ({pr.done}/{pr.total}){pr.overdue ? ` · ${pr.overdue} late` : ""} · {canEdit && <ActionButton url="/api/plans" body={{ action: "deletePlan", planId: plan.id }} label="Delete plan" className="act act-danger" confirmText="Delete this plan and all its tasks?" />}</p>
      <div className="card"><FypGantt holidays={Array.from(cal.off)} items={tasks.map((t) => ({ label: t.title, sub: people.find((p) => p.id === t.ownerId)?.name || t.ownerText || "", from: t.startDate.toISOString(), to: t.endDate.toISOString(), kind: "task" as const, status: t.status, critical: an.info.get(t.id)?.critical }))} />
        <p className="small-note">Pink bands: holidays. Dark outline: critical path. Red: late.</p></div>
      <div className="card"><FypPlanEditor apiUrl="/api/plans" cycleId={plan.id} issues={an.issues} people={people.map((p) => ({ id: p.id, name: p.name }))} canEdit={canEdit} canStatusIds={tasks.filter((t) => t.ownerId === user.id).map((t) => t.id)}
        tasks={tasks.map((t) => ({ ...t, startDate: t.startDate.toISOString(), endDate: t.endDate.toISOString(), slack: an.info.get(t.id)?.slack, critical: an.info.get(t.id)?.critical }))} /></div>
    </Shell>
  );
}
