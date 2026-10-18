import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { outcomesData, FORMATS } from "../../../lib/outcomesReport";
import { SOURCES } from "../../../lib/indirectPlo";
import PrintButton from "../../../components/PrintButton";

export const dynamic = "force-dynamic";

// Printable outcomes-assessment report for a cohort in the chosen council's format (NCEAC, PEC, ABET, NBEAC, HEC),
// plus a one-click evidence bundle (ZIP).
export default async function OutcomesReport({ searchParams }: { searchParams: { batch?: string; format?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  const fk = FORMATS[searchParams.format || ""] ? searchParams.format! : "NCEAC";
  const f = FORMATS[fk];
  const d = sel ? await outcomesData(sel.id) : null;
  const th = { border: "1px solid #999", padding: "4px 6px", background: "#EEF2F6", textAlign: "left" as const, fontSize: 12 };
  const td = { border: "1px solid #999", padding: "4px 6px", fontSize: 12, verticalAlign: "top" as const };
  return (
    <main style={{ maxWidth: 1000, margin: "20px auto", padding: 16, fontSize: 13.5 }}>
      <form className="no-print card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a href="/dashboard" className="btn btn-secondary btn-sm">← Back</a>
        <select name="batch" defaultValue={sel?.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
        <select name="format" defaultValue={fk}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
        <button className="btn btn-sm">Build report</button>
        {d && <a className="btn btn-secondary btn-sm" href={`/api/accreditation/outcomes-bundle?batch=${d.batch.id}&format=${fk}`}>Download evidence bundle (ZIP)</a>}
        <PrintButton />
      </form>
      {!d ? <p>No cohort selected.</p> : (
        <>
          <h1 style={{ fontSize: 20, marginBottom: 2 }}>Outcomes Assessment Report — {f.name}</h1>
          <p style={{ margin: 0 }}>{d.batch.degreeProgram} · {d.batch.batchName} · Program Lead: {d.batch.coordinator.name} · Generated {new Date().toISOString().slice(0, 10)}</p>

          <h2 style={{ fontSize: 16 }}>{f.sections[0]}</h2>
          {d.mission && <p><b>Mission:</b> {d.mission}</p>}
          {d.peos.length ? <ol>{d.peos.map((p, i) => <li key={i}>{p}</li>)}</ol> : <p><i>Program educational objectives not yet entered (Program Profile).</i></p>}

          <h2 style={{ fontSize: 16 }}>{f.sections[1]}</h2>
          <p>Each {f.outcome} is assessed directly (share of students&apos; course results meeting it) and indirectly (share of survey ratings of 3 or more out of 5). Target: blended attainment ≥ {d.plo.target}%.</p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={th}>{f.outcome}</th>{f.outcomes.length > 0 && <th style={th}>{fk} attribute</th>}{SOURCES.map(([k, v]) => <th key={k} style={th}>{v} ({d.plo.weights[k]})</th>)}<th style={th}>Blended</th><th style={th}>Met</th></tr></thead>
            <tbody>{d.plo.rows.map((r) => <tr key={r.number}><td style={td}>GA-{r.number}: {r.title}</td>{f.outcomes.length > 0 && <td style={td}>{f.outcomes[r.number - 1] ? `${fk === "ABET" ? "SO" : "GA"} ${r.number} — ${f.outcomes[r.number - 1]}` : "—"}</td>}
              {SOURCES.map(([k]) => <td key={k} style={td}>{r.cells[k] ? `${r.cells[k]!.pct}% (n=${r.cells[k]!.n})` : "—"}</td>)}<td style={{ ...td, fontWeight: 700 }}>{r.blended ?? "—"}{r.blended !== null ? "%" : ""}</td><td style={td}>{r.met === null ? "—" : r.met ? "Yes" : "No"}</td></tr>)}</tbody></table>
          {f.outcomes.length > 0 && <p style={{ fontSize: 12 }}><i>{fk} attributes are matched to the program&apos;s GAs by number; keep GA numbering aligned with the {fk} list.</i></p>}

          <h2 style={{ fontSize: 16 }}>{f.sections[2]}</h2>
          <p>{f.courseReport}: share of students meeting each CLO, from finalised results.</p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={th}>Course</th><th style={th}>Term</th><th style={th}>Students</th><th style={th}>Failed</th><th style={th}>CLO results</th></tr></thead>
            <tbody>{d.courses.map((c) => <tr key={c.code}><td style={td}>{c.code} {c.title}</td><td style={td}>{c.term}</td><td style={td}>{c.n}</td><td style={td}>{c.fails}</td><td style={td}>{c.clos.map((x) => `${x.code} ${x.pct}%`).join(" · ") || "—"}</td></tr>)}</tbody></table>
          {!d.courses.length && <p><i>No finalised results yet.</i></p>}

          <h2 style={{ fontSize: 16 }}>{f.sections[3]}</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={th}>Outcome</th><th style={th}>Finding</th><th style={th}>Action</th><th style={th}>Before → after</th><th style={th}>Status</th></tr></thead>
            <tbody>{d.cqi.map((c, i) => <tr key={i}><td style={td}>{c.sourceReference || "—"}</td><td style={td}>{c.finding}</td><td style={td}>{c.actionTaken || "—"}</td><td style={td}>{c.metricBefore ?? "—"} → {c.metricAfter ?? "—"}</td><td style={td}>{c.status}</td></tr>)}</tbody></table>
          {!d.cqi.length && <p><i>No improvement actions recorded for this cohort yet.</i></p>}
          {d.plo.rows.filter((r) => r.met === false).length > 0 && <p><b>Outcomes below target needing an action:</b> {d.plo.rows.filter((r) => r.met === false).map((r) => `GA-${r.number}`).join(", ")}</p>}

          <h2 style={{ fontSize: 16 }}>Supporting evidence</h2>
          <p>Sampled student scripts (best / average / weakest): {d.samples}. Verified student portfolio entries: {d.verified}. The evidence bundle contains these indexes with links, and the data tables above as spreadsheets.</p>
        </>
      )}
    </main>
  );
}
