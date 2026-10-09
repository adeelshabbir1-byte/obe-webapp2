import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import LabInventoryManager from "../../components/LabInventoryManager";
import { labRatio, labScope } from "../../lib/resources";

const LABEL: Record<string, string> = { LAB_MANAGER: "Lab Manager", CHAIRMAN: "Institute Head", HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator" };

export default async function LabInventoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const scope = await labScope(user);
  if (!scope) redirect("/dashboard");

  const [departments, labs] = await Promise.all([
    prisma.department.findMany({ where: { chairmanId: scope.chairmanId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.labInfo.findMany({ where: { chairmanId: scope.chairmanId, ...(scope.departmentIds ? { departmentId: { in: scope.departmentIds.length ? scope.departmentIds : ["none"] } } : {}) }, orderBy: [{ departmentId: "asc" }, { name: "asc" }] }),
  ]);
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || "Common";
  const shownDepts = scope.departmentIds ? departments.filter((d) => scope.departmentIds!.includes(d.id)) : departments;
  const ratios = await Promise.all(shownDepts.map(async (d) => ({ d, r: await labRatio(scope.chairmanId, d.id) })));
  const total = await labRatio(scope.chairmanId, scope.departmentIds && scope.departmentIds.length === 1 ? scope.departmentIds[0] : null);
  const tot = ratios.length > 1 || !scope.departmentIds ? total : ratios[0]?.r || total;

  return (
    <Shell roleLabel={LABEL[user.role] || "Lab"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Lab Inventory</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        What each computer lab holds. The Lab Manager keeps this up to date; the students-per-computer figure below is worked out from it and the student lists.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {[["Labs", tot.labs], ["Computers working", `${tot.working} of ${tot.computers}`], ["Seats", tot.seats], ["Students", tot.students], ["Students per working computer", tot.perComputer ?? "—"]].map(([l, v]) => (
          <div key={String(l)} style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 18px", minWidth: 140 }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>{v}</div>
            <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div>
          </div>
        ))}
      </div>
      {ratios.length > 1 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>By department</h3>
          <table>
            <thead><tr><th>Department</th><th>Labs</th><th>Working computers</th><th>Students</th><th>Students per computer</th></tr></thead>
            <tbody>{ratios.map(({ d, r }) => <tr key={d.id}><td>{d.name}</td><td>{r.labs}</td><td>{r.working}</td><td>{r.students}</td><td><b>{r.perComputer ?? "—"}</b></td></tr>)}</tbody>
          </table>
        </div>
      )}
      <LabInventoryManager canEdit={scope.canEdit} departments={scope.departmentIds ? null : departments}
        labs={labs.map((l) => ({ id: l.id, name: l.name, departmentId: l.departmentId, departmentName: deptName(l.departmentId), location: l.location, seats: l.seats, computers: l.computers, computersWorking: l.computersWorking, software: l.software, equipment: l.equipment, internetMbps: l.internetMbps, lastAudit: l.lastAudit ? l.lastAudit.toISOString() : null, notes: l.notes }))} />
    </Shell>
  );
}
