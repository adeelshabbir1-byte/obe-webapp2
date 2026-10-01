import type { TranscriptCourseRow, AttainmentAgg, RemediationEntry, RemainingCourseEntry } from "../lib/studentTranscriptReport";

// Deliberately rendered as two separate, clearly-labeled reports rather
// than one merged table — a registrar/advisor cares about Transcript 1
// (grades, GPA, CGPA); an OBE/accreditation reviewer cares about
// Transcript 2 (which CLOs/PLOs this student actually met). Keeping them
// visually apart means either one can be screenshotted/printed on its own
// without the other's columns in the way.
export default function StudentTranscriptReport({ studentName, rollNumber, batchLabel, courseRows, cgpa, totalCredits, cloAgg, ploAgg, remediation, remaining }: {
  studentName: string; rollNumber: string; batchLabel: string;
  courseRows: TranscriptCourseRow[]; cgpa: number | null; totalCredits: number;
  cloAgg: Map<string, AttainmentAgg>; ploAgg: Map<string, AttainmentAgg>; remediation: RemediationEntry[];
  remaining: RemainingCourseEntry[];
}) {
  return (
    <>
      <div className="card">
        <p style={{ fontSize: 13 }}><b>{studentName}</b> — Roll No. {rollNumber} — {batchLabel}</p>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Transcript 1 — Grades &amp; GPA</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>Course-by-course grades and the cumulative GPA (CGPA) used for academic standing.</p>
        {cgpa !== null && <p style={{ fontSize: 13, marginBottom: 10 }}><b>Cumulative GPA:</b> {cgpa.toFixed(2)} ({totalCredits} credit hours)</p>}
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

      {remaining.length > 0 && (
        <div className="card" style={{ borderColor: "var(--rust)", background: "#FFF5F0" }}>
          <h3 style={{ fontSize: 14, marginBottom: 4, color: "var(--rust)" }}>Courses Remaining</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
            Courses from this student's batch curriculum they're lacking — failed or dropped, with no later
            passing attempt. These still need to be cleared to graduate.
          </p>
          <table>
            <thead><tr><th>Code</th><th>Title</th><th>Cr. Hrs.</th><th>Status</th><th>Last Attempt</th></tr></thead>
            <tbody>
              {remaining.map((r) => (
                <tr key={r.code} style={{ background: r.reason === "WITHDRAWN" ? "#FFF3D6" : "#FFE0D6" }}>
                  <td>{r.code}</td><td>{r.title}</td><td>{r.creditHours}</td>
                  <td style={{ fontWeight: 600, color: "var(--rust)" }}>{r.reason === "WITHDRAWN" ? "Dropped" : "Failed"}</td>
                  <td>{r.lastGrade} — {r.lastTermName} {r.lastTermYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Transcript 2 — CLO/PLO Attainment</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Which Course and Program Learning Outcomes this student has met, across every course taken — the
          OBE accreditation record, independent of letter grades.
        </p>
        <table>
          <thead><tr><th>CLO</th><th>Attempted</th><th>Passed</th></tr></thead>
          <tbody>
            {cloAgg.size === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No data yet.</td></tr>}
            {Array.from(cloAgg.entries()).map(([code, v]) => (
              <tr key={code}><td>{code}</td><td>{v.attempted}</td><td style={{ color: "var(--sage)", fontWeight: 600 }}>{v.passed}</td></tr>
            ))}
          </tbody>
        </table>
        <table style={{ marginTop: 14 }}>
          <thead><tr><th>PLO</th><th>Attempted</th><th>Passed</th></tr></thead>
          <tbody>
            {ploAgg.size === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No data yet.</td></tr>}
            {Array.from(ploAgg.entries()).map(([label, v]) => (
              <tr key={label}><td>{label}</td><td>{v.attempted}</td><td style={{ color: "var(--sage)", fontWeight: 600 }}>{v.passed}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {remediation.length > 0 && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 4, color: "var(--rust)" }}>PLO Remediation Path</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>
            For each PLO with at least one recorded failure, here are the courses in this student's curriculum
            that still contribute to it and haven't been taken yet.
          </p>
          {remediation.map((r) => (
            <div key={r.ploLabel} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{r.ploLabel}</p>
              {r.courses.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--rust)" }}>No remaining courses in this curriculum contribute to this PLO — this needs a curriculum review.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {r.courses.map((c) => <li key={c.code} style={{ fontSize: 12.5 }}>{c.code} — {c.title}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
