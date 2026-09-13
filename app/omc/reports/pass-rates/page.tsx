import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor, chairmanIdFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { computeCloPloPassRates } from "../../../../lib/resultMate";
import { getPassingCriteria } from "../../../../lib/passingCriteria";
import Shell from "../../../../components/Shell";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import SimpleBarChart from "../../../../components/SimpleBarChart";

export default async function PassRatesPage({ searchParams }: { searchParams: { courseId?: string; compareId?: string } }) {
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
  const criteria = await getPassingCriteria(await chairmanIdFor(user));
  const result = selectedCourseId ? await computeCloPloPassRates(selectedCourseId, criteria) : null;

  const pastOfferings = course
    ? await prisma.attainmentSnapshot.findMany({ where: { coordinatorId: course.coordinatorId, courseLabel: `${course.code} — ${course.title}` }, orderBy: [{ termYear: "desc" }] })
    : [];
  const selectedCompareId = searchParams.compareId || "";
  const compareSnapshot = pastOfferings.find((s) => s.id === selectedCompareId);
  const compareStats = compareSnapshot ? {
    studentCount: compareSnapshot.studentCount,
    cloStats: JSON.parse(compareSnapshot.cloStatsJson) as { code: string; maxWeight: number; passCount: number; failCount: number }[],
    ploStats: JSON.parse(compareSnapshot.ploStatsJson) as { label: string; maxWeight: number; passCount: number; failCount: number }[],
    histogram: JSON.parse(compareSnapshot.histogramJson) as { label: string; count: number }[],
  } : null;

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="CLO / PLO Pass Rate Report" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        A student passes a CLO or PLO if they scored at least 50% of its maximum weighted marks.
      </p>
      <div className="card no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
          <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        </div>
        {selectedCourseId && <a href={`/api/omc/reports/pass-rates-document?courseId=${selectedCourseId}`} className="btn btn-brass" style={{ textDecoration: "none" }}>Download Report (Word)</a>}
      </div>

      {course && (
        <div className="card">
          <p style={{ fontSize: 12.5 }}><b>Course:</b> {course.code} — {course.title} &nbsp; <b>Instructor:</b> {course.instructor?.name || "—"}</p>
        </div>
      )}

      {course && pastOfferings.length > 0 && (
        <div className="card no-print">
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Compare Against a Past Offering</label>
          <form method="GET" style={{ display: "inline" }}>
            <input type="hidden" name="courseId" value={selectedCourseId} />
            <select name="compareId" defaultValue={selectedCompareId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">— None —</option>
              {pastOfferings.map((s) => <option key={s.id} value={s.id}>{s.termName} {s.termYear} ({s.studentCount} students)</option>)}
            </select>
            <button type="submit" className="btn btn-brass" style={{ marginLeft: 8 }}>Compare</button>
          </form>
        </div>
      )}

      {result && result.studentCount === 0 && (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No students enrolled, or no marks entered yet.</p></div>
      )}

      {result && result.studentCount > 0 && (
        <>
          <div className="card" style={{ display: compareStats ? "grid" : undefined, gridTemplateColumns: compareStats ? "1fr 1fr" : undefined, gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 14, marginBottom: 12 }}>Overall Score Distribution {compareStats && "(Current)"}</h3>
              <SimpleBarChart bars={result.histogram.map((b) => ({ label: b.label, value: b.count }))} />
            </div>
            {compareStats && (
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>{compareSnapshot!.termName} {compareSnapshot!.termYear} ({compareStats.studentCount} students)</h3>
                <SimpleBarChart bars={compareStats.histogram.map((b) => ({ label: b.label, value: b.count, color: "#7C3AED" }))} />
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Students Who Passed Each CLO {compareStats && "— Current vs Past"}</h3>
            <SimpleBarChart bars={result.cloStats.map((c) => ({ label: c.code, value: c.passCount }))} unit={` / ${result.studentCount}`} />
            {compareStats && (
              <>
                <p style={{ fontSize: 11, color: "var(--slate)", margin: "14px 0 6px" }}>{compareSnapshot!.termName} {compareSnapshot!.termYear}:</p>
                <SimpleBarChart bars={compareStats.cloStats.map((c) => ({ label: c.code, value: c.passCount, color: "#7C3AED" }))} unit={` / ${compareStats.studentCount}`} />
              </>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Students Who Passed Each PLO {compareStats && "— Current vs Past"}</h3>
            <SimpleBarChart bars={result.ploStats.map((p) => ({ label: p.label, value: p.passCount }))} unit={` / ${result.studentCount}`} />
            {compareStats && (
              <>
                <p style={{ fontSize: 11, color: "var(--slate)", margin: "14px 0 6px" }}>{compareSnapshot!.termName} {compareSnapshot!.termYear}:</p>
                <SimpleBarChart bars={compareStats.ploStats.map((p) => ({ label: p.label, value: p.passCount, color: "#7C3AED" }))} unit={` / ${compareStats.studentCount}`} />
              </>
            )}
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pass / Fail by CLO — Detail</h3>
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
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pass / Fail by PLO — Detail</h3>
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
