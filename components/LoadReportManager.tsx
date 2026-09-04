"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Term = { termName: string; year: number };
type Row = {
  instructorId: string; name: string; normalLoad: number; externalLoadCount: number; externalLoadNote: string | null;
  assigned: number; total: number; over: boolean; details: { label: string; term: string; sections: number }[];
};

export default function LoadReportManager() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[] | null>(null);
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
      setRows(data.rows); setLoading(false);
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
          <SortableTable>
            <thead><tr><th>Faculty</th><th>Assigned Sections</th><th>External</th><th>Total</th><th>Normal Load</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No faculty found.</td></tr>}
              {rows.map((r) => (
                <tr key={r.instructorId} style={{ background: r.over ? "#FFE4DC" : undefined }}>
                  <td>{r.name}</td><td>{r.assigned}</td>
                  <td>{r.externalLoadCount}{r.externalLoadNote ? ` (${r.externalLoadNote})` : ""}</td>
                  <td style={{ fontWeight: 600 }}>{r.total}</td><td>{r.normalLoad}</td>
                  <td>{r.over ? <span className="badge badge-no">Over</span> : <span className="badge badge-ok">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
      )}
    </>
  );
}
