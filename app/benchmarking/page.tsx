import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { loadResults, pivot, ploByCohort, DIMS, METRICS, type BRow } from "../../lib/benchmark";

export const dynamic = "force-dynamic";
type SP = { tab?: string; program?: string; by1?: string; by2?: string; m?: string | string[]; fprogram?: string; fyear?: string };

// Benchmarking across programs and cohorts, and a report builder over all finalised results.
export default async function Benchmarking({ searchParams }: { searchParams: SP }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const rows = await loadResults(where);
  const tab = ["years", "builder"].includes(searchParams.tab || "") ? searchParams.tab! : "programs";
  const programs = Array.from(new Set(rows.map((r) => r.program))).sort();
  const years = Array.from(new Set(rows.map((r) => r.year))).sort();
  const heat = (v: number | null) => (v === null ? undefined : v >= 70 ? "#DDEFDF" : v >= 50 ? "#FFF3D6" : "#FDE3E1");
  const T = ({ head, body }: { head: string[]; body: (string | number | null)[][] }) => (
    <div style={{ overflowX: "auto" }}><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c ?? "—"}</td>)}</tr>)}</tbody></table></div>);
  const tabs = <nav className="tabs" style={{ marginBottom: 10 }}>{[["programs", "Compare programs"], ["years", "Year over year"], ["builder", "Report builder"]].map(([k, v]) => <a key={k} className="tab" href={`/benchmarking?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{v}</a>)}</nav>;
  let body: React.ReactNode = null;

  if (!rows.length) body = <p className="small-note">No finalised results yet. Benchmarks appear once results are approved.</p>;
  else if (tab === "programs") {
    const mets = ["count", "avgPct", "passPct", "avgGpa", "cloRate", "ploRate", "aPct"];
    const p = pivot(rows, ["program"], mets);
    const all = mets.map((m) => pivot(rows, [], [m])[0]?.values[0] ?? null);
    body = <div className="card"><T head={["Program", ...mets.map((m) => METRICS.find((x) => x[0] === m)![1])]} body={[...p.map((r) => [r.keys[0], ...r.values]), ["All programs", ...all]]} />
      <p className="small-note">Each row covers every finalised course result of the program&apos;s cohorts. Compare a program&apos;s CLO/GA rates with the institute line to spot outliers.</p></div>;
  } else if (tab === "years") {
    const prog = programs.includes(searchParams.program || "") ? searchParams.program! : programs[0];
    const pr = rows.filter((r) => r.program === prog);
    const yo = ploByCohort(pr);
    const coh = pivot(pr, ["intake", "batch"], ["count", "avgPct", "passPct", "cloRate", "ploRate"]);
    body = <>
      <form className="card" style={{ display: "flex", gap: 8 }}><input type="hidden" name="tab" value="years" /><select name="program" defaultValue={prog}>{programs.map((p) => <option key={p}>{p}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>
      <div className="card"><h3 style={{ marginTop: 0 }}>Cohorts of {prog}</h3><T head={["Intake", "Batch", "Results", "Avg marks %", "Pass %", "CLOs met %", "GAs met %"]} body={coh.map((r) => [...r.keys, ...r.values])} /></div>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>GA results met, by cohort</h3>
        <table><thead><tr><th>GA</th>{yo.cohorts.map((c) => <th key={c}>{c}</th>)}<th>Change</th></tr></thead>
          <tbody>{yo.nums.map((n, i) => { const v = yo.grid[i].filter((x): x is number => x !== null); const ch = v.length > 1 ? Math.round(10 * (v[v.length - 1] - v[0])) / 10 : null;
            return <tr key={n}><td>GA-{n}</td>{yo.grid[i].map((x, j) => <td key={j} style={{ background: heat(x) }}>{x ?? "—"}</td>)}<td style={{ color: ch === null ? undefined : ch >= 0 ? "#1F5E36" : "#B3261E", fontWeight: 700 }}>{ch === null ? "—" : `${ch > 0 ? "+" : ""}${ch}`}</td></tr>; })}</tbody></table>
        <p className="small-note">Green ≥ 70%, amber 50–70%, red below 50%. Change = latest cohort minus the oldest.</p></div>
    </>;
  } else {
    const by = [searchParams.by1, searchParams.by2].filter((d): d is string => !!d && DIMS.some((x) => x[0] === d)) as (keyof BRow)[];
    const by1 = by.length ? by : (["program"] as (keyof BRow)[]);
    const ms = (Array.isArray(searchParams.m) ? searchParams.m : searchParams.m ? [searchParams.m] : ["count", "avgPct", "passPct"]).filter((m) => METRICS.some((x) => x[0] === m));
    const filtered = rows.filter((r) => (!searchParams.fprogram || r.program === searchParams.fprogram) && (!searchParams.fyear || String(r.year) === searchParams.fyear));
    const res = pivot(filtered, by1, ms);
    const qs = new URLSearchParams(); by1.forEach((d, i) => qs.set(`by${i + 1}`, String(d))); ms.forEach((m) => qs.append("m", m)); if (searchParams.fprogram) qs.set("fprogram", searchParams.fprogram); if (searchParams.fyear) qs.set("fyear", searchParams.fyear);
    body = <>
      <form className="card" style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="tab" value="builder" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>Group by
          <select name="by1" defaultValue={by1[0] as string}>{DIMS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> then
          <select name="by2" defaultValue={(by1[1] as string) || ""}><option value="">—</option>{DIMS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          Program <select name="fprogram" defaultValue={searchParams.fprogram || ""}><option value="">All</option>{programs.map((p) => <option key={p}>{p}</option>)}</select>
          Year <select name="fyear" defaultValue={searchParams.fyear || ""}><option value="">All</option>{years.map((y) => <option key={y}>{y}</option>)}</select></div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>{METRICS.map(([k, v]) => <label key={k}><input type="checkbox" name="m" value={k} defaultChecked={ms.includes(k)} /> {v}</label>)}</div>
        <div><button className="btn btn-sm">Run report</button> <a className="btn btn-secondary btn-sm" href={`/api/benchmarking?${qs.toString()}`}>Download CSV</a></div>
      </form>
      <div className="card"><T head={[...by1.map((d) => DIMS.find((x) => x[0] === d)![1]), ...ms.map((m) => METRICS.find((x) => x[0] === m)![1])]} body={res.map((r) => [...r.keys, ...r.values])} /><p className="small-note">{filtered.length} results.</p></div>
    </>;
  }
  return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22 }}>Benchmarking &amp; Reports</h1>{tabs}{body}</Shell>;
}
