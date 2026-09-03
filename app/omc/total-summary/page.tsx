import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { computeTotalSummary } from "../../../lib/totalSummary";
import Shell from "../../../components/Shell";
import AutoSubmitSelect from "../../../components/AutoSubmitSelect";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/adherence-report", label: "Cross-Instructor Comparison" },
  { href: "/omc/total-summary", label: "Total Summary" },
  { href: "/omc/weight-compliance", label: "Weight Compliance" },
  { href: "/omc/submission-timeliness", label: "Submission Timeliness" },
  { href: "/omc/delivery-completion", label: "Delivery Completion" },
  { href: "/omc/plo-readiness", label: "PLO Readiness" },
  { href: "/omc/section-utilization", label: "Section Utilization" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function TotalSummaryPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { batch: true },
    orderBy: [{ code: "asc" }],
  });

  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const summary = selectedCourseId ? await computeTotalSummary(selectedCourseId) : null;
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Total Summary</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every topic's contribution to each CLO, each PLO, and each assessment type — from the Subject Expert's plan.
      </p>

      {courses.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses yet.</p></div>
      ) : (
        <>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Course</label>
            <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title} (${c.batch ? c.batch.batchName : "—"})` }))} />
          </div>

          {summary && summary.topics.length === 0 && (
            <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No lecture topics filled in for this course yet.</p></div>
          )}

          {summary && summary.topics.length > 0 && (
            <>
              <div className="card" style={{ overflowX: "auto" }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Topic → CLO Contribution</h3>
                <table>
                  <thead><tr><th>Topic</th><th>Lec</th>{summary.cloCodes.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
                  <tbody>
                    {summary.topics.map((t) => (
                      <tr key={t.topic}>
                        <td>{t.topic}</td><td>{t.lectures}</td>
                        {summary.cloCodes.map((c) => <td key={c}>{t.byClo[c] || 0}</td>)}
                        <td style={{ fontWeight: 600 }}>{t.cloTotal}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ overflowX: "auto" }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Topic → Assessment Type</h3>
                <table>
                  <thead><tr><th>Topic</th><th>Lec</th><th>Assignment</th><th>Quiz</th><th>Project</th><th>Lab</th><th>Mid</th><th>Final</th></tr></thead>
                  <tbody>
                    {summary.topics.map((t) => (
                      <tr key={t.topic}>
                        <td>{t.topic}</td><td>{t.lectures}</td>
                        <td>{t.byType.Assignment || 0}</td><td>{t.byType.Quiz || 0}</td><td>{t.byType.Project || 0}</td>
                        <td>{t.byType.Lab || 0}</td><td>{t.byType.Midterm || 0}</td><td>{t.byType.Final || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {summary.ploLabels.length > 0 && (
                <div className="card" style={{ overflowX: "auto" }}>
                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Topic → PLO Contribution</h3>
                  <table>
                    <thead><tr><th>Topic</th><th>Lec</th>{summary.ploLabels.map((p) => <th key={p}>{p}</th>)}</tr></thead>
                    <tbody>
                      {summary.topics.map((t) => (
                        <tr key={t.topic}>
                          <td>{t.topic}</td><td>{t.lectures}</td>
                          {summary.ploLabels.map((p) => <td key={p}>{t.byPlo[p] || 0}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Shell>
  );
}
