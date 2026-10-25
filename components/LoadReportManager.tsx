"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Term = { termName: string; year: number };
type Row = {
  instructorId: string; name: string; role: string; normalLoad: number; externalLoadCount: number; externalLoadNote: string | null;
  assigned: number; total: number; over: boolean; details: { label: string; term: string; sections: number }[];
  byTerm: Record<string, number>; labs?: number; labDetails?: { label: string; term: string; sections: number }[];
};

export default function LoadReportManager() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [termLabels, setTermLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/coordinator/load-report").then((r) => r.json()).then((d) => setTerms(d.terms || []));
  }, []);

  function termKey(t: Term) { return `${t.termName}-${t.year}`; }
  function toggleTerm(t: Term) {
    const key = termKey(t);
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
  }

  async function generate() {
    if (selected.size === 0) { setError("Select at least one semester."); return; }
    setLoading(true); setError("");
    const chosen = terms.filter((t) => selected.has(termKey(t)));
    try {
      const res = await fetch("/api/coordinator/load-report", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms: chosen }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRows(data.rows); setTermLabels(data.termLabels || []); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function exportExcel() {
    const chosen = terms.filter((t) => selected.has(termKey(t)));
    const res = await fetch("/api/coordinator/load-report/export", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms: chosen }),
    });
    if (!res.ok) { setError("Export failed."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "teacher-load-report.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Select Semester(s)</h3>
        {terms.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No semesters have been offered yet.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          {terms.map((t) => (
            <label key={termKey(t)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, border: "1px solid var(--line)", padding: "6px 10px" }}>
              <input type="checkbox" checked={selected.has(termKey(t))} onChange={() => toggleTerm(t)} />
              {t.termName} {t.year}
            </label>
          ))}
        </div>
        <button onClick={generate} disabled={loading || terms.length === 0} className="btn btn-brass">{loading ? "Generating…" : "Generate Report"}</button>
      </div>

      {rows && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ fontSize: 14 }}>Teacher Load Report</h3>
            <button onClick={exportExcel} className="btn btn-brass" style={{ padding: "6px 12px", fontSize: 12 }}>Export to Excel</button>
          </div>
          {(() => {
            const theory = rows.filter((r) => r.role !== "LAB_ENGINEER");
            const lab = rows.filter((r) => r.role === "LAB_ENGINEER" || (r.labs || 0) > 0);
            const nameCell = (r: any) => <td><a href={`/faculty-record/${r.instructorId}`} title="Their courses, results and delivery">{r.name}</a> {r.role === "SUBJECT_EXPERT" && <span className="badge badge-warn" style={{ fontSize: 9, marginLeft: 4 }}>SE</span>}<div style={{ fontSize: 10.5, color: "var(--slate)" }}>{(r.details || []).map((d: any) => `${d.label}${d.sections > 1 ? ` ×${d.sections}` : ""}`).join(" · ")}</div></td>;
            return <>
              <h4 style={{ margin: "6px 0" }}>Instructors — theory sections ({theory.length})</h4>
              <SortableTable>
                <thead><tr><th>Faculty</th>{termLabels.map((label) => <th key={label}>{label}</th>)}<th>Assigned Sections</th><th>External</th><th>Total</th><th>Normal Load</th><th>Status</th></tr></thead>
                <tbody>
                  {theory.length === 0 && <tr><td colSpan={6 + termLabels.length} style={{ color: "var(--slate)" }}>No instructors found.</td></tr>}
                  {theory.map((r) => (
                    <tr key={r.instructorId} style={{ background: r.over ? "#FBE2DF" : undefined }}>
                      {nameCell(r)}
                      {termLabels.map((label) => <td key={label}>{r.byTerm[label] ?? 0}</td>)}
                      <td>{r.assigned}</td><td>{r.externalLoadCount}{r.externalLoadNote ? ` (${r.externalLoadNote})` : ""}</td>
                      <td style={{ fontWeight: 600 }}>{r.total}</td><td>{r.normalLoad}</td>
                      <td>{r.over ? <span className="badge badge-no">Over</span> : <span className="badge badge-ok">OK</span>}</td>
                    </tr>))}
                </tbody>
              </SortableTable>
              <h4 style={{ margin: "14px 0 6px" }}>Lab instructors / Lab engineers — labs ({lab.length})</h4>
              <SortableTable>
                <thead><tr><th>Lab staff</th><th>Labs run</th><th>Lab courses</th><th>Theory sections</th></tr></thead>
                <tbody>
                  {lab.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No lab staff found.</td></tr>}
                  {lab.map((r) => (
                    <tr key={r.instructorId}><td><a href={`/faculty-record/${r.instructorId}`}>{r.name}</a></td><td style={{ fontWeight: 600 }}>{r.labs || 0}</td><td style={{ fontSize: 11 }}>{(r.labDetails || []).map((d: any) => `${d.label} (${d.term})`).join(" · ") || "—"}</td><td>{r.role === "LAB_ENGINEER" ? r.assigned : "—"}</td></tr>))}
                </tbody>
              </SortableTable>
            </>;
          })()}
        </div>
      )}
    </>
  );
}
