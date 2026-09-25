import { redirect } from "next/navigation";
import SortableTable from "../../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import { getAuditReport } from "../../../../lib/reports";
import Shell from "../../../../components/Shell";
import ReportsSubNav from "../../../../components/ReportsSubNav";

function flagBadge(flag: string) {
  if (flag === "orphan") return <span style={{ background: "#FFE8ED", color: "var(--rust)", fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>Orphan — No PLO</span>;
  if (flag === "broad") return <span style={{ background: "#E8E6FB", color: "var(--brass-dark)", fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>Overly Broad</span>;
  return <span style={{ background: "#CCFBF1", color: "var(--sage)", fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>OK</span>;
}

export default async function AuditReportPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.audit"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const filter = { degree: searchParams.degree, batchId: searchParams.batchId };

  const programs = await getAuditReport(user, filter);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <ReportPrintHeader title="Course-Level Accreditation Audit & Orphan Detection" />
        <a href="/api/omc/reports/audit/export" className="btn btn-export no-print" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Flags orphan courses (mapped to zero PLOs) and overly broad courses (mapped to every single PLO indiscriminately) — both signal misconfiguration to accreditation panels.
      </p>
      <ReportsSubNav active="audit" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>

      {programs.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs yet.</p></div>}

      {programs.map((prog) => (
        <div key={prog.coordinatorName} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>{prog.coordinatorName}'s Program</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: prog.orphanCount > 0 ? "var(--rust)" : "var(--sage)", fontFamily: "Georgia, serif" }}>{prog.orphanCount}</div>
              <div style={{ fontSize: 11, color: "var(--slate)" }}>Orphan Courses</div>
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: prog.broadCount > 0 ? "var(--brass-dark)" : "var(--sage)", fontFamily: "Georgia, serif" }}>{prog.broadCount}</div>
              <div style={{ fontSize: 11, color: "var(--slate)" }}>Overly Broad</div>
            </div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <SortableTable>
              <thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Sem</th><th>PLOs Mapped</th><th>Flag</th></tr></thead>
              <tbody>
                {prog.rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
                {prog.rows.map((r) => (
                  <tr key={r.code}>
                    <td>{r.code}</td><td>{r.title}</td><td>{r.courseType}</td><td>{r.semesterNumber ?? "—"}</td>
                    <td>{r.ploCount} / {r.totalPlos}</td><td>{flagBadge(r.flag)}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        </div>
      ))}
    </Shell>
  );
}
