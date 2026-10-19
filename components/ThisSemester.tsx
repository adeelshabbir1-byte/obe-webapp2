import type { NowRow } from "../lib/studentNow";

const GOOD = "#1E7B45", WARN = "#B26A00", BAD = "#C62828";
const gradeColor = (g: string | null) => (!g ? "var(--slate)" : /^A/.test(g) ? GOOD : /^B/.test(g) ? "#1565C0" : /^C/.test(g) ? WARN : BAD);
const pill = (text: string, bg: string) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, background: bg, color: "#fff", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{text}</span>;

/** Current semester: attendance, marks so far, class position and expected grade per course. */
export default function ThisSemester({ rows }: { rows: NowRow[] }) {
  if (!rows.length) return null;
  const ch = rows.reduce((a, r) => a + r.creditHours, 0);
  return (
    <div className="card" style={{ borderTop: "4px solid #1565C0", marginBottom: 18, overflowX: "auto" }}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>This semester — {rows.length} course(s), {ch} credit hours</h2>
      <p style={{ fontSize: 12, color: "var(--slate)", margin: "0 0 8px" }}>Live from your teachers&apos; records. &quot;Expected&quot; is the grade if your marks so far hold to the end of the course.</p>
      <table style={{ fontSize: 13, width: "100%" }}>
        <thead><tr style={{ background: "#1565C0", color: "#fff" }}><th style={{ color: "#fff" }}>Course</th><th style={{ color: "#fff", textAlign: "center" }}>Attendance</th><th style={{ color: "#fff", textAlign: "center" }}>Marks so far</th><th style={{ color: "#fff", textAlign: "center" }}>Class avg</th><th style={{ color: "#fff", textAlign: "center" }}>Position</th><th style={{ color: "#fff", textAlign: "center" }}>Expected</th><th style={{ color: "#fff", textAlign: "center" }}>Your target</th></tr></thead>
        <tbody>{rows.map((r) => {
          const a = r.att, bad = a.pct !== null && a.pct < a.minPct, near = a.pct !== null && !bad && a.pct < a.minPct + 5;
          const m = r.pctSoFar, mBg = m === null ? "#9E9E9E" : m >= 70 ? GOOD : m >= 55 ? WARN : BAD;
          return (
            <tr key={r.courseId} style={{ borderLeft: `5px solid ${bad || (m !== null && m < 50) ? BAD : near ? WARN : GOOD}` }}>
              <td><b>{r.code}</b> {r.title}<div style={{ fontSize: 11, color: "var(--slate)" }}>{r.creditHours} CH · {r.submitted}/{r.given} assessed items marked for you</div></td>
              <td style={{ textAlign: "center" }}>{a.pct === null ? <span style={{ color: "var(--slate)" }}>not marked yet</span> : <>{pill(`${Math.round(a.pct)}%`, bad ? BAD : near ? WARN : GOOD)}<div style={{ fontSize: 11 }}>{a.attended}/{a.held} classes{a.canMiss !== null ? ` · can miss ${a.canMiss}` : ""}</div></>}</td>
              <td style={{ textAlign: "center" }}>{m === null ? <span style={{ color: "var(--slate)" }}>no marks yet</span> : <>{pill(`${m}%`, mBg)}<div style={{ fontSize: 11 }}>{r.earned} of {r.assessedWeight}% assessed</div></>}</td>
              <td style={{ textAlign: "center" }}>{r.classAvgPct !== null ? `${r.classAvgPct}%` : "—"}</td>
              <td style={{ textAlign: "center" }}>{r.band ? `${r.band}${r.rank ? ` (#${r.rank}/${r.classSize})` : ""}` : "—"}</td>
              <td style={{ textAlign: "center", fontSize: 18, fontWeight: 800, color: gradeColor(r.expectedGrade) }}>{r.expectedGrade || "—"}</td>
              <td style={{ textAlign: "center", fontWeight: 700 }}>{r.plannedGrade || "—"}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
