import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { computeResultMate } from "../../../lib/resultMate";
import Shell from "../../../components/Shell";
import ReportPrintHeader from "../../../components/ReportPrintHeader";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/required-books", label: "Required Textbooks" },
  { href: "/coordinator/student-transcript", label: "Student Transcript" },
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function StudentTranscriptPage({ searchParams }: { searchParams: { studentId?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });
  const batchIds = batches.map((b) => b.id);

  const q = searchParams.q || "";
  const matches = q
    ? await prisma.student.findMany({ where: { batchId: { in: batchIds }, OR: [{ name: { contains: q, mode: "insensitive" } }, { rollNumber: { contains: q, mode: "insensitive" } }] }, include: { batch: true }, take: 20 })
    : [];

  const student = searchParams.studentId ? await prisma.student.findUnique({ where: { id: searchParams.studentId }, include: { batch: true } }) : null;
  const belongsToCoordinator = student && batchIds.includes(student.batchId);

  let courseRows: { code: string; title: string; creditHours: number; grade: string; gpaPoints: number | null; totalPct: number; termName: string; termYear: number; isCurrent: boolean }[] = [];
  let cloAgg = new Map<string, { attempted: number; passed: number }>();
  let ploAgg = new Map<string, { attempted: number; passed: number }>();
  let totalCredits = 0, totalGradePoints = 0;

  if (student && belongsToCoordinator) {
    const historical = await prisma.studentTranscriptRecord.findMany({ where: { studentId: student.id }, orderBy: [{ termYear: "asc" }] });
    for (const r of historical) {
      courseRows.push({ code: r.courseCode, title: r.courseTitle, creditHours: r.creditHours, grade: r.grade, gpaPoints: r.gpaPoints, totalPct: r.totalPct, termName: r.termName, termYear: r.termYear, isCurrent: false });
      if (r.gpaPoints !== null) { totalCredits += r.creditHours; totalGradePoints += r.gpaPoints * r.creditHours; }
      for (const c of JSON.parse(r.cloAttainmentJson) as { code: string; passed: boolean }[]) {
        const e = cloAgg.get(c.code) || { attempted: 0, passed: 0 };
        e.attempted++; if (c.passed) e.passed++;
        cloAgg.set(c.code, e);
      }
      for (const p of JSON.parse(r.ploAttainmentJson) as { label: string; passed: boolean }[]) {
        const e = ploAgg.get(p.label) || { attempted: 0, passed: 0 };
        e.attempted++; if (p.passed) e.passed++;
        ploAgg.set(p.label, e);
      }
    }

    // Currently-active enrollments (not yet reset by a re-offering) — live-computed.
    const currentEnrollments = await prisma.studentEnrollment.findMany({ where: { studentId: student.id }, include: { course: true } });
    for (const e of currentEnrollments) {
      const result = await computeResultMate(e.courseId);
      const row = result.rows.find((r) => r.studentId === student.id);
      if (!row) continue;
      const gradingScale = await prisma.gradingScale.findMany({ where: { coordinatorId: e.course.coordinatorId } });
      const gpaPoints = gradingScale.find((g) => g.letter === row.grade)?.gpaValue ?? null;
      courseRows.push({
        code: e.course.code, title: e.course.title, creditHours: e.course.creditHours, grade: row.grade, gpaPoints,
        totalPct: row.totalPct, termName: e.course.offeredTermName || "Current", termYear: e.course.offeredTermYear || new Date().getFullYear(), isCurrent: true,
      });
      if (gpaPoints !== null) { totalCredits += e.course.creditHours; totalGradePoints += gpaPoints * e.course.creditHours; }
      for (const code of result.cloCodes) {
        const entry = cloAgg.get(code) || { attempted: 0, passed: 0 };
        entry.attempted++; // approximate: counted as attempted whenever the CLO exists on a current course
        cloAgg.set(code, entry);
      }
    }
  }

  const cgpa = totalCredits > 0 ? Math.round((totalGradePoints / totalCredits) * 100) / 100 : null;

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <ReportPrintHeader title="Student Transcript" />
      <div className="card no-print">
        <form method="GET" style={{ display: "flex", gap: 10 }}>
          <input name="q" defaultValue={q} placeholder="Search by name or roll number..." style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--line)" }} />
          <button type="submit" className="btn btn-brass">Search</button>
        </form>
        {matches.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {matches.map((m) => (
              <a key={m.id} href={`/coordinator/student-transcript?studentId=${m.id}`} style={{ display: "block", padding: "6px 4px", fontSize: 13, color: "var(--brass-dark)", textDecoration: "none", borderBottom: "1px solid var(--line)" }}>
                {m.name} — {m.rollNumber} ({m.batch.degreeProgram} — {m.batch.batchName})
              </a>
            ))}
          </div>
        )}
      </div>

      {searchParams.studentId && !belongsToCoordinator && (
        <div className="card"><p style={{ color: "var(--rust)", fontSize: 12.5 }}>Student not found in your program.</p></div>
      )}

      {student && belongsToCoordinator && (
        <>
          <div className="card">
            <p style={{ fontSize: 13 }}><b>{student.name}</b> — Roll No. {student.rollNumber} — {student.batch.degreeProgram} ({student.batch.batchName})</p>
            {cgpa !== null && <p style={{ fontSize: 13, marginTop: 6 }}><b>Cumulative GPA:</b> {cgpa.toFixed(2)} ({totalCredits} credit hours)</p>}
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Course-Wise Record</h3>
            <table>
              <thead><tr><th>Term</th><th>Code</th><th>Title</th><th>Cr. Hrs.</th><th>Score</th><th>Grade</th><th>GPA Pts</th></tr></thead>
              <tbody>
                {courseRows.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No courses on record yet.</td></tr>}
                {courseRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.termName} {r.termYear}{r.isCurrent && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>In Progress</span>}</td>
                    <td>{r.code}</td><td>{r.title}</td><td>{r.creditHours}</td>
                    <td>{r.totalPct.toFixed(1)}%</td><td style={{ fontWeight: 600 }}>{r.grade}</td><td>{r.gpaPoints?.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>CLO-Wise Attainment (Cumulative)</h3>
            <table>
              <thead><tr><th>CLO</th><th>Attempted</th><th>Passed</th></tr></thead>
              <tbody>
                {cloAgg.size === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No data yet.</td></tr>}
                {Array.from(cloAgg.entries()).map(([code, v]) => (
                  <tr key={code}><td>{code}</td><td>{v.attempted}</td><td style={{ color: "var(--sage)", fontWeight: 600 }}>{v.passed}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>PLO-Wise Attainment (Cumulative, Historical Courses)</h3>
            <table>
              <thead><tr><th>PLO</th><th>Attempted</th><th>Passed</th></tr></thead>
              <tbody>
                {ploAgg.size === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No data yet.</td></tr>}
                {Array.from(ploAgg.entries()).map(([label, v]) => (
                  <tr key={label}><td>{label}</td><td>{v.attempted}</td><td style={{ color: "var(--sage)", fontWeight: 600 }}>{v.passed}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
