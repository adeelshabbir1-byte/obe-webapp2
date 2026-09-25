"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Term = { termName: string; year: number };
type Row = { degreeProgram: string; batchName: string; code: string; title: string; term: string; instructorNames: string[] };

export default function ElectiveInstructorReportManager() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [degreeFilter, setDegreeFilter] = useState("");

  useEffect(() => {
    fetch("/api/coordinator/elective-instructor-report").then((r) => r.json()).then((d) => setTerms(d.terms || []));
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
      const res = await fetch("/api/coordinator/elective-instructor-report", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms: chosen }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRows(data.rows); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function exportExcel() {
    const chosen = terms.filter((t) => selected.has(termKey(t)));
    const res = await fetch("/api/coordinator/elective-instructor-report/export", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms: chosen }),
    });
    if (!res.ok) { setError("Export failed."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "elective-instructor-report.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  const degrees = rows ? Array.from(new Set(rows.map((r) => r.degreeProgram))).sort() : [];
  const visibleRows = rows ? rows.filter((r) => !degreeFilter || r.degreeProgram === degreeFilter) : [];

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
        <button onClick={generate} disabled={loading || terms.length === 0} className="btn btn-ai">{loading ? "Generating…" : "Generate Report"}</button>
      </div>

      {rows && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ fontSize: 14 }}>Who Taught Each Elective</h3>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {degrees.length > 1 && (
                <select value={degreeFilter} onChange={(e) => setDegreeFilter(e.target.value)} style={{ padding: "5px 8px", border: "1px solid var(--line)", fontSize: 12 }}>
                  <option value="">All programs</option>
                  {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              <button onClick={exportExcel} className="btn btn-export" style={{ padding: "6px 12px", fontSize: 12 }}>Export to Excel</button>
            </div>
          </div>
          <SortableTable>
            <thead><tr><th>Degree Program</th><th>Batch</th><th>Code</th><th>Course</th><th>Term</th><th>Instructor(s)</th></tr></thead>
            <tbody>
              {visibleRows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No elective courses found for the selected term(s).</td></tr>}
              {visibleRows.map((r, i) => (
                <tr key={`${r.code}-${r.term}-${i}`}>
                  <td>{r.degreeProgram}</td><td>{r.batchName}</td><td>{r.code}</td><td>{r.title}</td><td>{r.term}</td>
                  <td>
                    {r.instructorNames.length > 0
                      ? r.instructorNames.join(", ")
                      : <span style={{ color: "var(--rust)" }}>— unassigned —</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
      )}
    </>
  );
}
