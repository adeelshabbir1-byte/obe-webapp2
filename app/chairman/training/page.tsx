import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { BADGES, badgesOf, policyOf } from "../../../lib/training";

export const dynamic = "force-dynamic";

// Institute Head: who is OBE-certified, and the rule that curriculum work needs certification.
export default async function TrainingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");
  const p = await policyOf(user.id);
  const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "OMC", "LAB_ENGINEER", "DEPARTMENT_COORDINATOR"] as never[] }, OR: [{ managedById: user.id }, { managedBy: { managedById: user.id } }] }, select: { id: true, name: true, role: true, departmentId: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const have = await badgesOf(staff.map((s) => s.id));
  const depts = new Map((await prisma.department.findMany({ where: { id: { in: staff.map((s) => s.departmentId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  let ex: string[] = []; try { ex = JSON.parse(p?.exemptJson || "[]"); } catch { ex = []; }
  const need = (r: string) => (r === "SUBJECT_EXPERT" ? "DESIGNER" : r === "INSTRUCTOR" || r === "LAB_ENGINEER" ? "BASICS" : "ASSESSOR");
  const certified = staff.filter((s) => have.get(s.id)?.has(need(s.role))).length;
  const active = p?.enabled && !(p.graceUntil && p.graceUntil > new Date());
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>OBE Training &amp; Certification</h1>
      <p className="small-note">{certified}/{staff.length} people hold the badge their role needs. Rule: {active ? "ON — uncertified Subject Experts and Instructors cannot change course design" : p?.enabled ? `ON from ${p.graceUntil?.toISOString().slice(0, 10)} (grace period)` : "OFF"}. Viewing, attendance and marks are never blocked.</p>
      <div className="card"><ActionForm url="/api/chairman/training" fixed={{ action: "save" }} submit="Save rule" initial={{ enabled: !!p?.enabled, graceUntil: p?.graceUntil ? p.graceUntil.toISOString().slice(0, 10) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }}
        fields={[{ name: "enabled", label: "Require certification before course-design work", type: "checkbox" }, { name: "graceUntil", label: "Grace period until (existing staff keep working until then)", type: "date" }]} />
        <div style={{ marginTop: 8 }}><ActionButton url="/api/chairman/training" body={{ action: "remind" }} label="Remind everyone not yet certified" className="btn btn-secondary btn-sm" /></div></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Needs</th>{BADGES.map((b) => <th key={b.key}>{b.name}</th>)}<th>Exempt</th></tr></thead>
          <tbody>{staff.map((s) => { const h = have.get(s.id); const ok = h?.has(need(s.role)); return (
            <tr key={s.id}><td>{s.name}</td><td>{roleLabel(s.role)}</td><td>{(s.departmentId && depts.get(s.departmentId)) || "—"}</td><td style={{ color: ok ? "#1F5E36" : "#B3261E" }}>{BADGES.find((b) => b.key === need(s.role))?.name}{ok ? " ✓" : ""}</td>
              {BADGES.map((b) => <td key={b.key}>{h?.get(b.key) ? <a href={`/learn/certificate/${h.get(b.key)!.id}`}>🏅 {h.get(b.key)!.score}/{h.get(b.key)!.total}</a> : "—"}</td>)}
              <td><ActionButton url="/api/chairman/training" body={{ action: "exempt", userId: s.id, on: !ex.includes(s.id) }} label={ex.includes(s.id) ? "Exempt ✓ (undo)" : "Exempt"} className="btn btn-secondary btn-sm" /></td></tr>); })}</tbody></table>
      </div>
    </Shell>
  );
}
