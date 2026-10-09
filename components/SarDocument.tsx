import { rate } from "../lib/readiness";
import type { computeReadiness } from "../lib/readiness";
import type { computeHecComparison } from "../lib/hecCompare";
import { EVIDENCE } from "../lib/evidence";
import PrintButton from "./PrintButton";

type Ev = { area: string; kind: string; title: string; organization: string | null; date: Date | null; count: number | null; target: number | null; actual: number | null };
const d = (x: Date | null) => (x ? x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

export default function SarDocument({ data, hec, evidence, program, department, lead, instituteHead, back }: {
  data: Awaited<ReturnType<typeof computeReadiness>>; hec: Awaited<ReturnType<typeof computeHecComparison>> | null; evidence: Ev[];
  program: string; department: string; lead: string; instituteHead: string; back: string;
}) {
  const { scored, overall, areas } = data;
  const ov = rate(overall);
  const h2 = { fontSize: 16, margin: "22px 0 6px", borderBottom: "1px solid #999", paddingBottom: 3 } as const;
  const cell = { border: "1px solid #bbb", padding: "4px 8px", fontSize: 12.5, textAlign: "left", verticalAlign: "top" } as const;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "18px 16px", background: "#fff", color: "#111", fontFamily: "Georgia, serif" }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } h2 { break-after: avoid; } table { break-inside: auto; } tr { break-inside: avoid; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <a className="btn" href={back}>← Back</a><PrintButton />
      </div>
      <h1 style={{ fontSize: 26, marginBottom: 2 }}>Self-Assessment Report</h1>
      <div style={{ fontSize: 15, marginBottom: 2 }}>{program}</div>
      <div style={{ fontSize: 12.5, color: "#555" }}>{department} · Program Lead: {lead} · Institute Head: {instituteHead}</div>
      <div style={{ fontSize: 12.5, color: "#555", marginBottom: 12 }}>Prepared on {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Every figure is taken from the institute&apos;s own records.</div>

      <h2 style={h2}>Summary</h2>
      <p style={{ fontSize: 13.5, margin: "4px 0" }}>Overall readiness: <b style={{ color: ov.colour }}>{overall === null ? "not measured" : `${overall}% (${ov.name})`}</b></p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr><th style={cell}>No.</th><th style={cell}>Criterion</th><th style={cell}>Score</th><th style={cell}>Rating</th></tr></thead>
        <tbody>{scored.map(({ a, s }) => { const r = rate(s); return (
          <tr key={a.no}><td style={cell}>{a.no}</td><td style={cell}>{a.title}</td><td style={cell}>{s === null ? "—" : `${s}%`}</td><td style={{ ...cell, color: r.colour, fontWeight: 700 }}>{r.name}</td></tr>
        ); })}</tbody>
      </table>

      {areas.map((a) => {
        const s = scored.find((x) => x.a.no === a.no)?.s ?? null; const r = rate(s);
        return (
          <section key={a.no} style={{ breakInside: "avoid-page" }}>
            <h2 style={h2}>Criterion {a.no}: {a.title} <span style={{ fontSize: 13, color: r.colour }}>— {s === null ? "not measured" : `${s}%, ${r.name}`}</span></h2>
            {a.checks.length > 0 && (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={cell}>Evidence</th><th style={cell}>Met</th></tr></thead>
                <tbody>{a.checks.map((c) => (
                  <tr key={c.label}><td style={cell}>{c.label}</td><td style={{ ...cell, whiteSpace: "nowrap", color: c.total > 0 && c.done >= c.total ? "#2E7D4F" : "#B3261E" }}>{c.total > 0 ? `${c.done} of ${c.total}` : "—"}</td></tr>
                ))}</tbody>
              </table>
            )}
            {a.manual.length > 0 && (<><p style={{ fontSize: 12.5, margin: "8px 0 2px" }}><b>To be shown to the visiting team from paper records:</b></p><ul style={{ fontSize: 12.5, margin: 0, paddingLeft: 20 }}>{a.manual.map((m) => <li key={m}>{m}</li>)}</ul></>)}
          </section>
        );
      })}

      {hec && !hec.empty && (
        <>
          <h2 style={h2}>Curriculum against the HEC reference</h2>
          <p style={{ fontSize: 13, margin: "4px 0" }}>
            Reference: {hec.ref?.authority} {hec.ref?.title} ({hec.ref?.version}); batch {hec.batch?.batchName}. Coverage of required courses: <b>{hec.coverage === null ? "—" : `${hec.coverage}%`}</b>.
            Credit hours: {hec.yoursTotal} (yours) against {hec.hecTotal} (reference). Missing courses: {hec.missing.length}. Extra courses: {hec.extra.length}. Courses whose credit hours or semester differ: {hec.differences.length}.
          </p>
          {hec.missing.length > 0 && <p style={{ fontSize: 12.5, margin: "2px 0" }}>Missing: {hec.missing.map((m) => `${m.code} ${m.title}`).join("; ")}.</p>}
        </>
      )}

      {EVIDENCE.map((def) => {
        const rows = evidence.filter((e) => e.area === def.area);
        if (!rows.length) return null;
        return (
          <section key={def.area}>
            <h2 style={h2}>Appendix: {def.heading}</h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={cell}>Date</th><th style={cell}>Type</th><th style={cell}>Title</th><th style={cell}>{def.area === "PEO" ? "Who" : "Organisation"}</th><th style={cell}>Detail</th></tr></thead>
              <tbody>{rows.map((e, i) => (
                <tr key={i}><td style={cell}>{d(e.date)}</td><td style={cell}>{e.kind}</td><td style={cell}>{e.title}</td><td style={cell}>{e.organization || ""}</td>
                  <td style={cell}>{e.kind === "KPI" ? `target ${e.target ?? "—"}, actual ${e.actual ?? "—"}` : e.count !== null ? `${e.count} students` : ""}</td></tr>
              ))}</tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
