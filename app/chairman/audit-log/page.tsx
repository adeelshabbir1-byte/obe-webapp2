import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

export default async function AuditLogPage({ searchParams }: { searchParams: { page?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const pageNum = parseInt(searchParams.page || "1", 10);
  const pageSize = 50;

  // Everyone this Chairman ultimately manages, directly or indirectly.
  const directReports = await prisma.user.findMany({ where: { managedById: user.id } });
  const coordinators = directReports.filter((u) => u.role === "PROGRAM_COORDINATOR");
  const indirect = await prisma.user.findMany({ where: { managedById: { in: coordinators.map((c) => c.id) } } });
  const actorIds = [user.id, ...directReports.map((u) => u.id), ...indirect.map((u) => u.id)];

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { actorUserId: { in: actorIds } },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where: { actorUserId: { in: actorIds } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Shell roleLabel="Chairman" userName={user.name} navLinks={[
      { href: "/chairman/coordinators", label: "Program Coordinators" },
      { href: "/chairman/plos", label: "Program Learning Outcomes" },
      { href: "/chairman/omc", label: "OMC Members" },
      { href: "/chairman/assigners", label: "Course Assigners" },
      { href: "/chairman/cqi", label: "CQI Records" },
      { href: "/chairman/audit-log", label: "Audit Log" },
      { href: "/omc/reports", label: "Reports" },
    ]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Audit Log</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Every significant action taken by anyone in your institution.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No activity yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{l.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td>{l.actor?.name || "System"}</td>
                <td style={{ fontSize: 11.5 }}>{l.action}</td>
                <td style={{ fontSize: 11 }}>{l.entityType ? `${l.entityType}${l.entityId ? ` (${l.entityId.slice(0, 8)}…)` : ""}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 11.5, color: "var(--slate)" }}>Page {pageNum} of {totalPages} ({total} total)</span>
          <div style={{ display: "flex", gap: 8 }}>
            {pageNum > 1 && <a href={`/chairman/audit-log?page=${pageNum - 1}`} style={{ fontSize: 12, color: "var(--brass-dark)" }}>← Previous</a>}
            {pageNum < totalPages && <a href={`/chairman/audit-log?page=${pageNum + 1}`} style={{ fontSize: 12, color: "var(--brass-dark)" }}>Next →</a>}
          </div>
        </div>
      </div>
    </Shell>
  );
}
