import type { computeHecComparison } from "../lib/hecCompare";

type D = Awaited<ReturnType<typeof computeHecComparison>>;
const th: React.CSSProperties = { textAlign: "left" };

export default function HecComparisonReport({ data, action }: { data: D; action: string }) {
  const { batches, refs, batch, ref } = data;
  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Curriculum vs HEC</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Compares the courses of one batch with the official reference curriculum: what is missing, what you added, and where credit hours or semesters differ.
        Courses are matched by the link made when imported, otherwise by the same code, otherwise by the same title.
      </p>
      <form method="GET" action={action} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }}>
        <label style={{ fontSize: 12 }}>Batch<br />
          <select name="batchId" defaultValue={batch?.id || ""}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Compare with<br />
          <select name="curriculumId" defaultValue={ref?.id || ""}>{refs.map((r) => <option key={r.id} value={r.id}>{r.authority}: {r.title} ({r.version})</option>)}</select></label>
        <button className="btn" type="submit">Compare</button>
      </form>
      {data.empty ? (
        <div className="card" style={{ color: "var(--slate)" }}>
          {!batch ? "This program has no batch yet." : "No official reference curriculum is available. The Super User must publish one."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            {([
              ["Coverage of HEC courses", data.coverage === null ? "—" : `${data.coverage}%`],
              ["Credit hours: yours / HEC", `${data.yoursTotal} / ${data.hecTotal}`],
              ["Missing courses", data.missing.length],
              ["Extra courses", data.extra.length],
              ["Differences", data.differences.length],
            ] as [string, string | number][]).map(([l, v]) => (
              <div key={String(l)} style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 18px", minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>{v}</div>
                <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Credit hours by category</h3>
            <table>
              <thead><tr><th style={th}>Category</th><th>HEC credits</th><th>Yours (matched)</th><th>Gap</th><th>Courses missing</th></tr></thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.cat}><td>{c.cat}</td><td>{c.hec}</td><td>{c.yours}</td>
                    <td style={{ color: c.yours < c.hec ? "#B3261E" : undefined, fontWeight: 600 }}>{c.yours - c.hec === 0 ? "—" : c.yours - c.hec}</td><td>{c.missing || "—"}</td></tr>
                ))}
                <tr><td>Track electives (optional)</td><td>—</td><td>{data.electiveMatchedCredits}</td><td>—</td><td>—</td></tr>
                <tr><td>Extra, not in HEC</td><td>—</td><td>{data.extraCredits}</td><td>—</td><td>—</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
            <h3 style={{ marginTop: 0, color: data.missing.length ? "#B3261E" : undefined }}>Missing from your batch ({data.missing.length})</h3>
            {data.missing.length === 0 ? <p style={{ color: "var(--slate)" }}>Every required HEC course is present.</p> : (
              <table><thead><tr><th style={th}>Code</th><th style={th}>Course</th><th>Credits</th><th style={th}>Category</th><th>Semester</th></tr></thead>
                <tbody>{data.missing.map((m) => <tr key={m.id}><td>{m.code}</td><td>{m.title}</td><td>{m.creditHours}</td><td>{m.category}</td><td>{m.semesterNumber ?? "—"}</td></tr>)}</tbody></table>
            )}
            {data.optionalElectives.length > 0 && <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 10 }}>{data.optionalElectives.length} track-elective courses in the HEC list are not taken here. They are optional, so they are not counted as missing.</p>}
          </div>

          <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Credit hours or semester differ ({data.differences.length})</h3>
            {data.differences.length === 0 ? <p style={{ color: "var(--slate)" }}>None.</p> : (
              <table><thead><tr><th style={th}>Course</th><th>Credits (yours / HEC)</th><th>Semester (yours / HEC)</th></tr></thead>
                <tbody>{data.differences.map(({ c, m }) => (
                  <tr key={c.id}><td>{c.code} {c.title}</td>
                    <td style={{ color: c.creditHours !== m.creditHours ? "#B3261E" : undefined }}>{c.creditHours} / {m.creditHours}</td>
                    <td style={{ color: c.semesterNumber !== m.semesterNumber ? "#B3261E" : undefined }}>{c.semesterNumber ?? "—"} / {m.semesterNumber ?? "—"}</td></tr>
                ))}</tbody></table>
            )}
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Added by you, not in HEC ({data.extra.length})</h3>
            {data.extra.length === 0 ? <p style={{ color: "var(--slate)" }}>None.</p> : (
              <table><thead><tr><th style={th}>Code</th><th style={th}>Course</th><th>Credits</th><th style={th}>Type</th><th>Semester</th></tr></thead>
                <tbody>{data.extra.map((c) => <tr key={c.id}><td>{c.code}</td><td>{c.title}{c.isNonCredit ? " (non-credit)" : ""}</td><td>{c.creditHours}</td><td>{c.courseType}</td><td>{c.semesterNumber ?? "—"}</td></tr>)}</tbody></table>
            )}
          </div>
        </>
      )}
    </>
  );
}
