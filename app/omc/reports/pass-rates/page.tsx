import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { computeCloPloPassRates } from "../../../../lib/resultMate";
import Shell from "../../../../components/Shell";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import SimpleBarChart from "../../../../components/SimpleBarChart";

export default async function PassRatesPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.pass-rates"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const courses = await prisma.course.findMany({
    where: { AND: [courseScopeFor(user), { instructorId: { not: null } }] },
    include: { batch: true, instructor: true },
    orderBy: { code: "asc" },
  });
  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const result = selectedCourseId ? await computeCloPloPassRates(selectedCourseId) : null;

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="CLO / PLO Pass Rate Report" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        A student passes a CLO or PLO if they scored at least 50% of its maximum weighted marks.
      </p>
      <div className="card no-print">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
      </div>

      {course && (
        <div className="card">
          <p style={{ fontSize: 12.5 }}><b>Course:</b> {course.code} — {course.title} &nbsp; <b>Instructor:</b> {course.instructor?.name || "—"}</p>
        </div>
      )}

      {result && result.studentCount === 0 && (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No students enrolled, or no marks entered yet.</p></div>
      )}

      {result && result.studentCount > 0 && (
        <>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Overall Score Distribution</h3>
            <SimpleBarChart bars={result.histogram.map((b) => ({ label: b.label, value: b.count }))} />
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pass / Fail by CLO</h3>
            <table>
              <thead><tr><th>CLO</th><th>Max Weight</th><th>Passed</th><th>Failed</th><th>Pass Rate</th></tr></thead>
              <tbody>
                {result.cloStats.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No CLOs defined yet.</td></tr>}
                {result.cloStats.map((c) => (
                  <tr key={c.code}>
                    <td>{c.code}</td><td>{c.maxWeight}%</td>
                    <td style={{ color: "var(--sage)", fontWeight: 600 }}>{c.passCount}</td>
                    <td style={{ color: "var(--rust)", fontWeight: 600 }}>{c.failCount}</td>
                    <td>{Math.round((c.passCount / result.studentCount) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pass / Fail by PLO</h3>
            <table>
              <thead><tr><th>PLO</th><th>Max Weight</th><th>Passed</th><th>Failed</th><th>Pass Rate</th></tr></thead>
              <tbody>
                {result.ploStats.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No CLOs mapped to a PLO yet.</td></tr>}
                {result.ploStats.map((p) => (
                  <tr key={p.label}>
                    <td>{p.label}</td><td>{p.maxWeight}%</td>
                    <td style={{ color: "var(--sage)", fontWeight: 600 }}>{p.passCount}</td>
                    <td style={{ color: "var(--rust)", fontWeight: 600 }}>{p.failCount}</td>
                    <td>{Math.round((p.passCount / result.studentCount) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
