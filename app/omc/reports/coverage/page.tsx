import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { getCoverageReport } from "../../../../lib/reports";
import { courseTypeColor } from "../../../../lib/courseTypeColors";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import ReportsSubNav from "../../../../components/ReportsSubNav";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import SimpleBarChart from "../../../../components/SimpleBarChart";

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "14px 16px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || "var(--ink)", fontFamily: "Georgia, serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default async function CoverageReportPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.coverage"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const filter = { degree: searchParams.degree, batchId: searchParams.batchId };

  const programs = await getCoverageReport(user, filter);
  const legendTypes = Array.from(new Set(programs.flatMap((p) => p.rows.flatMap((r) => Object.keys(r.byType))))).sort();

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <ReportPrintHeader title="Program-Level PLO Coverage & Distribution Summary" />
        <a href="/api/omc/reports/coverage/export" className="btn btn-brass no-print" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        How comprehensively the program addresses each PLO — a short bar means few courses map to it, worth reviewing.
      </p>
      <ReportsSubNav active="coverage" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>

      {programs.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs match this filter.</p></div>}

      {programs.map((sec) => (
        <div key={sec.coordinatorName} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>{sec.coordinatorName}'s Program</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <StatCard label="PLOs Defined" value={sec.totalPlos} />
            <StatCard label="PLOs Approved" value={sec.approved} tone="var(--sage)" />
            <StatCard label="Courses in Program" value={sec.totalCourses} />
            <StatCard label="Avg Courses / PLO" value={sec.avg} />
            <StatCard label="PLOs Not Hit" value={sec.notHit} tone={sec.notHit > 0 ? "var(--rust)" : "var(--sage)"} />
          </div>

          <div className="card">
            <h4 style={{ fontSize: 12.5, marginBottom: 12, color: "var(--slate)" }}>Courses Mapped, per PLO</h4>
            {sec.rows.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No PLOs defined.</p>
            ) : (
              <SimpleBarChart
                bars={sec.rows.map((r) => ({ label: `PLO-${r.number}`, value: r.count, color: r.count === 0 ? "#B1512E" : undefined }))}
              />
            )}
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h4 style={{ fontSize: 12.5, marginBottom: 12, color: "var(--slate)" }}>Detail — Breakdown by Course Type</h4>
            <table>
              <thead><tr><th>PLO</th><th>Title</th><th>Status</th><th>Courses</th><th>By Course Type</th></tr></thead>
              <tbody>
                {sec.rows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No PLOs defined.</td></tr>}
                {sec.rows.map((r) => {
                  const typeEntries = Object.entries(r.byType);
                  return (
                    <tr key={r.number}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>PLO-{r.number}</td>
                      <td>{r.title}</td>
                      <td>
                        {r.status !== "approved" ? (
                          <span style={{ fontSize: 9, textTransform: "uppercase", color: "var(--slate)", background: "#EFECE3", padding: "1px 6px", borderRadius: 2 }}>{r.status.replace("-", " ")}</span>
                        ) : (
                          <span style={{ fontSize: 9, textTransform: "uppercase", color: "var(--sage)", background: "#CCFBF1", padding: "1px 6px", borderRadius: 2 }}>Approved</span>
                        )}
                      </td>
                      <td>
                        {r.count}
                        {r.count === 0 && <span style={{ marginLeft: 6, background: "#FFE4DC", color: "var(--rust)", fontSize: 9.5, textTransform: "uppercase", padding: "1px 6px", borderRadius: 2, fontWeight: 700 }}>Not Hit</span>}
                      </td>
                      <td>
                        {typeEntries.length === 0 ? "—" : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {typeEntries.map(([type, n]) => (
                              <span key={type} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 8, height: 8, background: courseTypeColor(type), display: "inline-block", borderRadius: 1 }} />
                                {type}: {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {legendTypes.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 12.5, marginBottom: 10, color: "var(--slate)" }}>Course Type Legend</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {legendTypes.map((t) => (
              <span key={t} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: courseTypeColor(t), display: "inline-block", borderRadius: 2 }} />{t}
              </span>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
