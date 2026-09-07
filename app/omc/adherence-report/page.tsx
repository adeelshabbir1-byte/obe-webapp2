import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor } from "../../../lib/reportScope";
import { canViewReport } from "../../../lib/reportAcl";
import { navForRole } from "../../../components/reportNav";
import { prisma } from "../../../lib/db";
import { getCourseFamily } from "../../../lib/varianceReport";
import Shell from "../../../components/Shell";
import AutoSubmitSelect from "../../../components/AutoSubmitSelect";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";
import ReportPrintHeader from "../../../components/ReportPrintHeader";
import SimpleBarChart from "../../../components/SimpleBarChart";

export default async function AdherenceReportPage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.adherence-report"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });

  let instructorCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, instructorId: { not: null } },
    include: { batch: true },
    orderBy: { code: "asc" },
    distinct: ["code"],
  });
  if (searchParams.batchId) instructorCourses = instructorCourses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) instructorCourses = instructorCourses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

  const selectedCourseId = searchParams.courseId || instructorCourses[0]?.id || "";
  const family = selectedCourseId ? await getCourseFamily(selectedCourseId) : [];

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Cross-Instructor Comparison" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Compares instructors teaching the same course — across batches and semesters — by how closely each
        followed the Subject Expert's plan.
      </p>

      <div className="card no-print" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Course</label>
          <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={instructorCourses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        </div>
      </div>

      {instructorCourses.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No instructor-assigned courses match this filter.</p></div>
      ) : (
        <>
          {family.length > 0 && (
            <>
              <div className="card">
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>Adherence % by Instructor</h3>
                <SimpleBarChart
                  bars={family.map((r) => ({ label: `${r.instructorName} (${r.term})`, value: r.adherencePct, color: r.adherencePct >= 80 ? "var(--sage)" : "var(--rust)" }))}
                  maxValue={100} unit="%"
                />
              </div>
              <div className="card">
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>Topics Missed by Instructor</h3>
                <SimpleBarChart bars={family.map((r) => ({ label: `${r.instructorName} (${r.term})`, value: r.topicsMissed, color: "var(--rust)" }))} />
              </div>
            </>
          )}

          <div className="card">
            <SortableTable>
              <thead><tr><th>Instructor</th><th>Batch</th><th>Term</th><th>Adherence %</th><th>Topics Missed</th></tr></thead>
              <tbody>
                {family.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No instructor deliveries found for this course.</td></tr>}
                {family.map((r) => (
                  <tr key={r.courseId}>
                    <td>{r.instructorName}</td><td style={{ fontSize: 11.5 }}>{r.batchLabel}</td><td>{r.term}</td>
                    <td style={{ fontWeight: 600, color: r.adherencePct >= 80 ? "var(--sage)" : "var(--rust)" }}>{r.adherencePct}%</td>
                    <td>{r.topicsMissed} / {r.totalTopics}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        </>
      )}
    </Shell>
  );
}
