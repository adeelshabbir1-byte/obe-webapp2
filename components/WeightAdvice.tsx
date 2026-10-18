// Planned vs suggested vs actual weights of one course plan: each CLO's share of the course, how its marks are spread over
// assessments, its attainment, and the rules: every CLO at least 10% of the course, no single assessment above 50% of a CLO.
export const MIN_CLO_SHARE = 10, MAX_ITEM_SHARE = 50;
type Chain = { clos: { id: string; code: string; ploNumber: number | null; weight: number; attainment: number | null; target: number; perfAttainment?: number | null }[]; assessments: { id: string; label: string; cloId: string | null; share: number; marksPct: number }[] };

export default function WeightAdvice({ chain }: { chain: Chain }) {
  const rows = chain.clos.map((c) => {
    const items = chain.assessments.filter((a) => a.cloId === c.id);
    const top = items.reduce((m, a) => (a.share > (m?.share ?? -1) ? a : m), null as (typeof items)[number] | null);
    const issues: string[] = [];
    if (!items.length) issues.push("no assessment — cannot be measured");
    else {
      if (c.weight < MIN_CLO_SHARE) issues.push(`only ${c.weight}% of the course (suggested ≥ ${MIN_CLO_SHARE}%)`);
      if (top && top.share > MAX_ITEM_SHARE && items.length > 0) issues.push(`${top.label} carries ${top.share}% of it (suggested ≤ ${MAX_ITEM_SHARE}%) — spread it over more items`);
    }
    if (c.attainment != null && c.attainment < c.target) issues.push(`attainment ${c.attainment}% below target ${c.target}% — plan a CQI action`);
    if (!c.ploNumber) issues.push("not mapped to a GA");
    return { c, items, issues };
  });
  const bad = rows.filter((r) => r.issues.length).length;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Weights: planned, suggested and actual</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Planned = from your plan (marks %). Suggested = every CLO at least {MIN_CLO_SHARE}% of the course and no single assessment more than {MAX_ITEM_SHARE}% of a CLO. Actual = students reaching the CLO, once marks are in.</p>
      <table>
        <thead><tr><th>CLO</th><th>GA</th><th>Planned share of course</th><th>Assessments (share of the CLO)</th><th>Actual attainment</th><th>Advice</th></tr></thead>
        <tbody>{rows.map(({ c, items, issues }) => (
          <tr key={c.id}>
            <td><b>{c.code}</b></td>
            <td>{c.ploNumber ? `GA-${c.ploNumber}` : "—"}</td>
            <td style={{ color: c.weight < MIN_CLO_SHARE ? "#B3261E" : undefined }}>{c.weight}%</td>
            <td style={{ fontSize: 12 }}>{items.length ? items.map((a) => <span key={a.id} style={{ marginRight: 8, color: a.share > MAX_ITEM_SHARE ? "#B3261E" : undefined }}>{a.label} {a.share}%</span>) : <span style={{ color: "#B3261E" }}>none</span>}</td>
            <td>{c.attainment != null ? <span style={{ color: c.attainment >= c.target ? "#1F5E36" : "#95650F", fontWeight: 700 }}>{c.attainment}%</span> : "—"}{c.perfAttainment != null && c.perfAttainment !== c.attainment && <div style={{ fontSize: 11, color: "#6B3F8A" }}>perf.-weighted {c.perfAttainment}%</div>}</td>
            <td style={{ fontSize: 12, color: issues.length ? "#7A520C" : "#1F5E36" }}>{issues.length ? issues.join("; ") : "OK"}</td>
          </tr>))}</tbody>
      </table>
      <p style={{ fontSize: 12.5, marginBottom: 0 }}>{bad ? `${bad} CLO${bad > 1 ? "s need" : " needs"} attention.` : "All CLOs follow the suggested weights."}</p>
    </div>
  );
}
