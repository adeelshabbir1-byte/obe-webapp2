import { redirect } from "next/navigation";
import SortableTable from "../../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { computePaperDistribution } from "../../../../lib/paperDistribution";
import Shell from "../../../../components/Shell";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";

export default async function FinalDistributionPage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.final-distribution"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  let courses = await prisma.course.findMany({ where: { ...courseScopeFor(user) }, include: { batch: true, instructor: true }, orderBy: { code: "asc" } });

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

    const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const dist = selectedCourseId ? await computePaperDistribution(selectedCourseId, "Final") : null;

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Breakdown of Topics Coverage in Final Exam" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} extraParams={{}} />
        <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        </div>
      </div>
      {course && (
        <div className="card">
          <p style={{ fontSize: 12.5 }}><b>Course:</b> {course.code} — {course.title} &nbsp; <b>Instructor:</b> {course.instructor?.name || "—"}</p>
        </div>
      )}
      {dist && dist.topics.length > 0 ? (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Topics → CLO Marks (Final only)</h3>
            <SortableTable>
              <thead><tr><th>Topic</th><th>Lec</th>{dist.cloCodes.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
              <tbody>
                {dist.topics.map((t) => (
                  <tr key={t.topic}><td>{t.topic}</td><td>{t.lectures}</td>{dist.cloCodes.map((c) => <td key={c}>{t.byClo[c] || 0}</td>)}<td style={{ fontWeight: 600 }}>{t.total}</td></tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                  <td>Total</td><td></td>
                  {dist.cloCodes.map((c) => <td key={c}>{Math.round(dist.topics.reduce((s, t) => s + (t.byClo[c] || 0), 0) * 10) / 10}</td>)}
                  <td>{dist.totalMarks}</td>
                </tr>
              </tbody>
            </SortableTable>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Question → CLO Breakdown</h3>
            <SortableTable>
              <thead><tr><th>Question</th><th>Marks</th>{dist.cloCodes.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {dist.questionRows.map((q) => (
                  <tr key={q.label}><td>Q{q.label}</td><td>{q.marksPct}</td>{dist.cloCodes.map((c) => <td key={c}>{q.byClo[c] || 0}</td>)}</tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        </>
      ) : (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No Midterm questions linked to lecture topics yet for this course.</p></div>
      )}
    </Shell>
  );
}
