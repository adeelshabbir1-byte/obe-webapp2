import type { CourseStatus } from "../lib/studentCourseStatus";

// The advisee's courses this semester: marks so far against the class, position, expected and planned grade.
const BAND_COLOR: Record<string, string> = { "Top 10%": "#23894f", "Top 20%": "#23894f", "Top 30%": "#2f6fd6", "Top half": "#2f6fd6", "Lower half": "#c98a0b", "Bottom 25%": "#c93c3c" };

export default function AdvisorCourseStatus({ courses, history }: { courses: CourseStatus[]; history: { courseCode: string; courseTitle: string; termName: string; termYear: number; grade: string; planned: string | null; frozen: boolean }[] }) {
  return (
    <>
      <h2 style={{ fontSize: 16, margin: "18px 0 8px" }}>This semester&apos;s courses — where the student stands</h2>
      {courses.length === 0 && <div className="card"><p className="small-note" style={{ margin: 0 }}>Not enrolled in any course this semester.</p></div>}
      <div style={{ display: "grid", gap: 10 }}>
        {courses.map((c) => {
          const met = c.plannedGrade && c.expectedGrade ? c.plannedGrade === c.expectedGrade : null;
          return (
            <details key={c.courseId} className="card" style={{ margin: 0 }}>
              <summary style={{ cursor: "pointer", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                <b>{c.code} {c.title}</b>
                <span className="small-note">{c.given} assessment{c.given === 1 ? "" : "s"} marked ({c.assessedWeight}% of the course)</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                  <span>So far <b>{c.pctSoFar ?? "—"}{c.pctSoFar !== null ? "%" : ""}</b> <span className="small-note">class {c.classAvgPct ?? "—"}{c.classAvgPct !== null ? "%" : ""}</span></span>
                  {c.rank && <span>#{c.rank} of {c.classSize}{c.band && <b style={{ color: BAND_COLOR[c.band], marginLeft: 4 }}>{c.band}</b>}</span>}
                  <span>Expected <b>{c.expectedGrade ?? "—"}</b></span>
                  <span>Planned <b>{c.plannedGrade ?? "—"}</b>{met === false && <span style={{ color: "#c93c3c" }}> ✕</span>}{met === true && <span style={{ color: "#23894f" }}> ✓</span>}</span>
                </span>
              </summary>
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ fontSize: 12.5 }}>
                  <thead><tr><th>Assessment</th><th>Type</th><th style={{ textAlign: "center" }}>Marks</th><th style={{ textAlign: "center" }}>Class average</th><th>Against the class</th></tr></thead>
                  <tbody>
                    {c.items.map((i, n) => {
                      const diff = i.score !== null && i.classAvg !== null ? Math.round((i.score - i.classAvg) * 10) / 10 : null;
                      return (
                        <tr key={n}>
                          <td>{i.label}</td><td className="small-note">{i.type}</td>
                          <td style={{ textAlign: "center" }}>{i.score !== null ? `${i.score} / ${i.max}` : i.classAvg !== null ? <span style={{ color: "#c93c3c" }}>missing</span> : <span className="small-note">not marked yet</span>}</td>
                          <td style={{ textAlign: "center" }}>{i.classAvg ?? "—"}</td>
                          <td style={{ color: diff === null ? undefined : diff >= 0 ? "#23894f" : "#c93c3c" }}>{diff === null ? "—" : diff >= 0 ? `+${diff} above` : `${diff} below`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="small-note" style={{ margin: "6px 0 0" }}>
                  &quot;So far&quot; is the student&apos;s marks as a share of the {c.assessedWeight}% assessed until now. The expected grade is what that share would earn if it held to the end
                  (the teacher&apos;s grade boundaries if set, otherwise the class mean/SD scheme). Planned is the target grade from the degree plan, kept as it stood at registration.
                </p>
              </div>
            </details>
          );
        })}
      </div>
      {history.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <b style={{ fontSize: 13.5 }}>Planned vs earned</b>
          <table style={{ fontSize: 12.5, marginTop: 6 }}>
            <thead><tr><th>Term</th><th>Course</th><th style={{ textAlign: "center" }}>Planned</th><th style={{ textAlign: "center" }}>Earned</th></tr></thead>
            <tbody>
              {history.map((h, n) => (
                <tr key={n}>
                  <td>{h.termName} {h.termYear}</td><td>{h.courseCode} {h.courseTitle}</td>
                  <td style={{ textAlign: "center" }}>{h.planned}{!h.frozen && <span className="small-note" title="Current target grade — no snapshot was taken at registration"> *</span>}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: h.grade === h.planned ? "#23894f" : undefined }}>{h.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
