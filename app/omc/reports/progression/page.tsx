import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import { getProgressionReport } from "../../../../lib/reports";
import Shell from "../../../../components/Shell";
import ReportsSubNav from "../../../../components/ReportsSubNav";

function heatColor(value: number, max: number) {
  if (value === 0) return "#F7F4EC";
  const intensity = Math.min(1, value / Math.max(1, max));
  const r = Math.round(247 - intensity * (247 - 75));
  const g = Math.round(244 - intensity * (244 - 122));
  const b = Math.round(236 - intensity * (236 - 99));
  return `rgb(${r},${g},${b})`;
}

export default async function ProgressionReportPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const filter = { degree: searchParams.degree, batchId: searchParams.batchId };

  const programs = await getProgressionReport(user, filter);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <ReportPrintHeader title="Semester-Wise PLO Progression & Balance" />
        <a href="/api/omc/reports/progression/export" className="btn btn-brass no-print" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        How outcomes scale across the 8 semesters — foundational PLOs should show up heavily in semesters 1–4, advanced ones in 5–8.
      </p>
      <ReportsSubNav active="progression" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>

      {programs.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs yet.</p></div>}

      {programs.map((prog) => {
        const allVals = prog.plos.flatMap((p) => prog.semesters.map((s) => prog.matrix[p.number]?.[s] || 0));
        const max = Math.max(1, ...allVals);
        return (
          <div className="card" key={prog.coordinatorName} style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>{prog.coordinatorName}'s Program</h3>
            {prog.plos.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 8 }}>No PLOs defined yet.</p>
            ) : (
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>PLO</th>
                    {prog.semesters.map((s) => <th key={s} style={{ textAlign: "center" }}>Sem {s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {prog.plos.map((p) => (
                    <tr key={p.number}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600, fontSize: 12 }}>PLO-{p.number}<br /><span style={{ fontWeight: 400, color: "var(--slate)", fontSize: 10.5 }}>{p.title}</span></td>
                      {prog.semesters.map((s) => {
                        const val = prog.matrix[p.number]?.[s] || 0;
                        return (
                          <td key={s} style={{ textAlign: "center", background: heatColor(val, max), fontWeight: val > 0 ? 600 : 400, color: val / max > 0.6 ? "#fff" : "var(--ink)" }}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </Shell>
  );
}
