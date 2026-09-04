import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { computeResultMate } from "../../../../lib/resultMate";
import Shell from "../../../../components/Shell";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";

export default async function ResultMatePage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, instructorId: { not: null } },
    include: { batch: true, instructor: true },
    orderBy: { code: "asc" },
  });
  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const result = selectedCourseId ? await computeResultMate(selectedCourseId) : null;

  const gradeBadge: Record<string, string> = { A: "badge-ok", B: "badge-ok", C: "badge-warn", D: "badge-warn", F: "badge-no" };

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Result Mate" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Relative grading, based on the class mean and standard deviation — A ≥ mean+SD, B ≥ mean, C ≥ mean−SD, D ≥ mean−2SD, else F.
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

      {result && (
        <>
          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{result.stats.count}</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Students</div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{result.stats.mean}%</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Class Mean</div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{result.stats.sd}</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Std. Deviation</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Roll #</th><th>Name</th>{result.cloCodes.map((c) => <th key={c}>{c}</th>)}<th>Total %</th><th>Grade</th></tr></thead>
              <tbody>
                {result.rows.length === 0 && <tr><td colSpan={result.cloCodes.length + 4} style={{ color: "var(--slate)" }}>No students enrolled, or no marks entered yet.</td></tr>}
                {result.rows.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.rollNumber}</td>
                    <td>{r.name}{r.isRepeat && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Repeat</span>}</td>
                    {result.cloCodes.map((c) => <td key={c}>{r.byClo[c] || 0}</td>)}
                    <td style={{ fontWeight: 600 }}>{r.totalPct}%</td>
                    <td><span className={`badge ${gradeBadge[r.grade]}`}>{r.grade}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.ploLabels.length > 0 && (
            <div className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>PLO Attainment, by Student</h3>
              <table>
                <thead><tr><th>Roll #</th><th>Name</th>{result.ploLabels.map((p) => <th key={p}>{p}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.studentId}>
                      <td>{r.rollNumber}</td><td>{r.name}</td>
                      {result.ploLabels.map((p) => <td key={p}>{r.byPlo[p] || 0}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
