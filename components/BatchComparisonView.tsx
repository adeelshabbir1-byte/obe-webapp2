import { TAG_LABEL, sideText, type Comparison, type Tag } from "../lib/batchCompare";

// The three-way comparison (new batch · council curriculum · previous batch): totals against the council's minimum or
// range, then course by course in three columns with what changed. Used by the Program Lead (step 13) and the OMC.
const TAG_COLOR: Record<Tag, string> = { same: "#2E7D32", renamed: "#1565C0", recoded: "#1565C0", moved: "#6A1B9A", ch: "#B26A00", added: "#00796B", dropped: "#C62828", elective: "#455A64", "not in curriculum": "#8D6E63" };
const ok = (v: boolean | null) => (v === null ? <span className="small-note" style={{ margin: 0 }}>—</span> : v ? <b style={{ color: "#2E7D32" }} aria-label="meets">✓</b> : <b style={{ color: "#C62828" }} aria-label="does not meet">✗</b>);

export default function BatchComparisonView({ cmp, batchId, exportBase = "/api/coordinator/batch-compare" }: { cmp: Comparison; batchId: string; exportBase?: string }) {
  const tags = (Object.keys(cmp.counts) as Tag[]).filter((t) => cmp.counts[t] > 0);
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Three-way comparison</h3>
        <span className="small-note" style={{ margin: 0 }}>{cmp.batch} · {cmp.councilTitle || "no council curriculum"} · {cmp.previousTitle || "no previous batch"}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <a className="btn btn-secondary btn-sm" href={`${exportBase}?batchId=${batchId}&format=pdf`}>Download PDF</a>
          <a className="btn btn-secondary btn-sm" href={`${exportBase}?batchId=${batchId}&format=xlsx`}>Download Excel</a>
        </span>
      </div>
      <p style={{ margin: "8px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>{tags.map((t) => <span key={t} style={{ border: `1.5px solid ${TAG_COLOR[t]}`, color: TAG_COLOR[t], borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 600 }}>{cmp.counts[t]} {TAG_LABEL[t]}</span>)}</p>
      <table className="table" style={{ fontSize: 12.5, marginBottom: 10 }}>
        <thead><tr><th>Totals</th><th>New batch</th><th>Council curriculum</th><th>Previous batch</th><th>Council rule</th><th>Meets</th></tr></thead>
        <tbody>
          <tr><td>Credit hours</td><td><b>{cmp.totals.ch[0]}</b></td><td>{cmp.totals.ch[1] || "—"}</td><td>{cmp.totals.ch[2] || "—"}</td><td>{cmp.totals.target ? `${cmp.totals.target[0]}–${cmp.totals.target[1]}` : "—"}</td><td>{ok(cmp.totals.chOk)}</td></tr>
          <tr><td>Courses</td><td><b>{cmp.totals.count[0]}</b></td><td>{cmp.totals.count[1] || "—"}</td><td>{cmp.totals.count[2] || "—"}</td><td>—</td><td>—</td></tr>
          {cmp.byType.map((t) => <tr key={t.type}><td>CH · {t.type}</td><td><b>{t.now}</b></td><td>{t.council || "—"}</td><td>{t.previous || "—"}</td><td>{t.min !== null && t.max !== null ? `${t.min}–${t.max}` : t.min !== null ? `at least ${t.min}` : t.max !== null ? `at most ${t.max}` : "—"}</td><td>{ok(t.ok)}</td></tr>)}
        </tbody>
      </table>
      <table className="table" style={{ fontSize: 12.5 }}>
        <thead><tr><th>New batch</th><th>Council curriculum</th><th>Previous batch</th><th>What changed</th></tr></thead>
        <tbody>{cmp.rows.map((r, i) => (
          <tr key={r.courseId || `x${i}`} style={{ background: r.tags.includes("dropped") ? "#FFF5F5" : undefined }}>
            <td>{sideText(r.now)}</td><td>{sideText(r.council)}</td><td>{sideText(r.previous)}</td>
            <td>{r.tags.map((t) => <span key={t} style={{ color: TAG_COLOR[t], fontWeight: 600, marginRight: 6, whiteSpace: "nowrap" }}>{TAG_LABEL[t]}</span>)}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
