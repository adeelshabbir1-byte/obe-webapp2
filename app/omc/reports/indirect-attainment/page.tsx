import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import SimpleBarChart from "../../../../components/SimpleBarChart";

export default async function IndirectAttainmentPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.indirect-attainment"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);

  const answers = await prisma.surveyAnswer.findMany({
    where: { surveyResponse: { surveyTemplate: { coordinatorId: { in: coordinatorIds } }, submittedAt: { not: null } } },
    include: { question: { include: { mappedPlo: true } }, surveyResponse: { include: { surveyTemplate: true } } },
  });

  const byPlo = new Map<string, { total: number; count: number; byStakeholder: Record<string, { total: number; count: number }> }>();
  const byPeo = new Map<string, { total: number; count: number; byStakeholder: Record<string, { total: number; count: number }> }>();
  for (const a of answers) {
    if (a.question.mappedPlo) {
      const label = `PLO-${a.question.mappedPlo.number}`;
      const entry = byPlo.get(label) || { total: 0, count: 0, byStakeholder: {} };
      entry.total += a.ratingValue; entry.count++;
      const stype = a.surveyResponse.respondentType;
      const se = entry.byStakeholder[stype] || { total: 0, count: 0 };
      se.total += a.ratingValue; se.count++;
      entry.byStakeholder[stype] = se;
      byPlo.set(label, entry);
    }
    if (a.question.mappedPeoLabel) {
      const label = a.question.mappedPeoLabel;
      const entry = byPeo.get(label) || { total: 0, count: 0, byStakeholder: {} };
      entry.total += a.ratingValue; entry.count++;
      const stype = a.surveyResponse.respondentType;
      const se = entry.byStakeholder[stype] || { total: 0, count: 0 };
      se.total += a.ratingValue; se.count++;
      entry.byStakeholder[stype] = se;
      byPeo.set(label, entry);
    }
  }

  const rows = Array.from(byPlo.entries()).map(([label, v]) => ({
    label, avg: Math.round((v.total / v.count) * 100) / 100, count: v.count,
    byStakeholder: Object.entries(v.byStakeholder).map(([type, s]) => ({ type, avg: Math.round((s.total / s.count) * 100) / 100, count: s.count })),
  })).sort((a, b) => a.label.localeCompare(b.label));

  const peoRows = Array.from(byPeo.entries()).map(([label, v]) => ({
    label, avg: Math.round((v.total / v.count) * 100) / 100, count: v.count,
    byStakeholder: Object.entries(v.byStakeholder).map(([type, s]) => ({ type, avg: Math.round((s.total / s.count) * 100) / 100, count: s.count })),
  })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Indirect PLO Attainment (Stakeholder Feedback)" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Average rating (1–5) per PLO from submitted student, alumni, and employer surveys — a second evidence
        source alongside direct (assessment-based) attainment, used to triangulate accreditation claims.
      </p>

      {rows.length === 0 && peoRows.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No submitted survey responses mapped to a PLO or PEO yet.</p></div>
      ) : (
        <>
          {rows.length > 0 && (
            <>
              <div className="card">
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>Average Rating per PLO (out of 5)</h3>
                <SimpleBarChart bars={rows.map((r) => ({ label: r.label, value: r.avg }))} maxValue={5} />
              </div>

              <div className="card" style={{ overflowX: "auto" }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Detail — by Stakeholder Group</h3>
                <table>
                  <thead><tr><th>PLO</th><th>Overall Avg</th><th>Responses</th><th>Breakdown</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <td style={{ fontWeight: 600 }}>{r.label}</td>
                        <td>{r.avg.toFixed(2)}</td>
                        <td>{r.count}</td>
                        <td style={{ fontSize: 11.5 }}>
                          {r.byStakeholder.map((s) => `${s.type}: ${s.avg.toFixed(2)} (n=${s.count})`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {peoRows.length > 0 && (
            <>
              <div className="card">
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>Average Rating per PEO (out of 5)</h3>
                <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10 }}>
                  Program Educational Objectives are typically assessed on a longer horizon (career outcomes,
                  usually 3–5 years post-graduation) — this is why PEO questions are answered mainly by alumni
                  and employers, not current students.
                </p>
                <SimpleBarChart bars={peoRows.map((r) => ({ label: r.label, value: r.avg }))} maxValue={5} />
              </div>

              <div className="card" style={{ overflowX: "auto" }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Detail — PEOs by Stakeholder Group</h3>
                <table>
                  <thead><tr><th>PEO</th><th>Overall Avg</th><th>Responses</th><th>Breakdown</th></tr></thead>
                  <tbody>
                    {peoRows.map((r) => (
                      <tr key={r.label}>
                        <td style={{ fontWeight: 600 }}>{r.label}</td>
                        <td>{r.avg.toFixed(2)}</td>
                        <td>{r.count}</td>
                        <td style={{ fontSize: 11.5 }}>
                          {r.byStakeholder.map((s) => `${s.type}: ${s.avg.toFixed(2)} (n=${s.count})`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
