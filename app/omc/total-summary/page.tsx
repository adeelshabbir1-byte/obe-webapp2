import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor, courseScopeFor } from "../../../lib/reportScope";
import { canViewReport } from "../../../lib/reportAcl";
import { navForRole } from "../../../components/reportNav";
import { prisma } from "../../../lib/db";
import { computeTotalSummary } from "../../../lib/totalSummary";
import Shell from "../../../components/Shell";
import AutoSubmitSelect from "../../../components/AutoSubmitSelect";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";
import ReportPrintHeader from "../../../components/ReportPrintHeader";

export default async function TotalSummaryPage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.total-summary"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });

  let courses = await prisma.course.findMany({
    where: { ...courseScopeFor(user) },
    include: { batch: true },
    orderBy: [{ code: "asc" }],
  });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const summary = selectedCourseId ? await computeTotalSummary(selectedCourseId) : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Total Summary" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every topic's contribution to each CLO, each PLO, and each assessment type — from the Subject Expert's plan.
        Rows in red have a mismatch between the CLO, assessment-type, and PLO totals — usually a lecture with a
        CLO assigned but no linked instrument, or vice versa.
      </p>

      <div className="card no-print" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Course</label>
          <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title} (${c.batch ? c.batch.batchName : "—"})` }))} />
        </div>
      </div>

      {courses.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses match this filter.</p></div>}

      {summary && summary.topics.length === 0 && (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No lecture topics filled in for this course yet.</p></div>
      )}

      {summary && summary.topics.length > 0 && (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Topic → CLO Contribution</h3>
            <SortableTable>
              <thead><tr><th>Topic</th><th>Lec</th>{summary.cloCodes.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
              <tbody>
                {summary.topics.map((t) => (
                  <tr key={t.topic} style={{ background: t.mismatch ? "#FFE8ED" : undefined }}>
                    <td>{t.topic}{t.mismatch && <span style={{ color: "var(--rust)", fontWeight: 700 }}> ⚠</span>}</td><td>{t.lectures}</td>
                    {summary.cloCodes.map((c) => <td key={c}>{t.byClo[c] || 0}</td>)}
                    <td style={{ fontWeight: 600 }}>{t.cloTotal}%</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                  <td>Total</td><td>{summary.totalLectures}</td>
                  {summary.cloCodes.map((c) => <td key={c}>{summary.colTotals.byClo[c] || 0}</td>)}
                  <td>{summary.grandTotal}%</td>
                </tr>
              </tbody>
            </SortableTable>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Topic → Assessment Type</h3>
            <SortableTable>
              <thead><tr><th>Topic</th><th>Lec</th><th>Assignment</th><th>Quiz</th><th>Project</th><th>Lab</th><th>Mid</th><th>Final</th><th>Total</th></tr></thead>
              <tbody>
                {summary.topics.map((t) => (
                  <tr key={t.topic} style={{ background: t.mismatch ? "#FFE8ED" : undefined }}>
                    <td>{t.topic}</td><td>{t.lectures}</td>
                    <td>{t.byType.Assignment || 0}</td><td>{t.byType.Quiz || 0}</td><td>{t.byType.Project || 0}</td>
                    <td>{t.byType.Lab || 0}</td><td>{t.byType.Midterm || 0}</td><td>{t.byType.Final || 0}</td>
                    <td style={{ fontWeight: 600 }}>{t.typeTotal}%</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                  <td>Total</td><td>{summary.totalLectures}</td>
                  <td>{summary.colTotals.byType.Assignment}</td><td>{summary.colTotals.byType.Quiz}</td>
                  <td>{summary.colTotals.byType.Project}</td><td>{summary.colTotals.byType.Lab}</td>
                  <td>{summary.colTotals.byType.Midterm}</td><td>{summary.colTotals.byType.Final}</td>
                  <td>{summary.grandTotal}%</td>
                </tr>
              </tbody>
            </SortableTable>
          </div>

          {summary.ploLabels.length > 0 && (
            <div className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Topic → PLO Contribution</h3>
              <SortableTable>
                <thead><tr><th>Topic</th><th>Lec</th>{summary.ploLabels.map((p) => <th key={p}>{p}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {summary.topics.map((t) => (
                    <tr key={t.topic} style={{ background: t.mismatch ? "#FFE8ED" : undefined }}>
                      <td>{t.topic}</td><td>{t.lectures}</td>
                      {summary.ploLabels.map((p) => <td key={p}>{t.byPlo[p] || 0}</td>)}
                      <td style={{ fontWeight: 600 }}>{t.ploTotal}%</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                    <td>Total</td><td>{summary.totalLectures}</td>
                    {summary.ploLabels.map((p) => <td key={p}>{summary.colTotals.byPlo[p] || 0}</td>)}
                    <td>{summary.grandTotal}%</td>
                  </tr>
                </tbody>
              </SortableTable>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
