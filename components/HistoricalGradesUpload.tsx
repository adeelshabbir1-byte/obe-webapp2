"use client";
import { useState } from "react";

const CHUNK_SIZE = 50;

type RowError = { row: number; rollNumber: string; courseCode: string; reason: string };
type ParsedRow = { rollNumber: string; courseCode: string; courseTitle: string; creditHours: string; grade: string; termName: string; termYear: string };

export default function HistoricalGradesUpload({ batches }: { batches: { id: string; degreeProgram: string; batchName: string }[] }) {
  const [batchId, setBatchId] = useState(batches[0]?.id || "");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; totalRows: number; rowErrors: RowError[] } | null>(null);

  async function runImport(mode: "file" | "paste") {
    if (!batchId) { setError("Pick a batch first."); return; }
    setLoading(true); setError(""); setResult(null); setProgress("");
    try {
      const parseFd = new FormData();
      if (mode === "file") {
        if (!file) { setLoading(false); return; }
        parseFd.append("file", file);
      } else {
        if (!csvText.trim()) { setLoading(false); return; }
        parseFd.append("csvText", csvText);
      }
      setProgress("Reading file…");
      const parseRes = await fetch("/api/coordinator/historical-grades/parse", { method: "POST", body: parseFd });
      const parseData = await parseRes.json();
      if (!parseRes.ok) { setError(parseData.error || "Something went wrong reading the file."); setLoading(false); return; }

      const allRows: ParsedRow[] = parseData.rows;
      const totalRows = allRows.length;
      let totalImported = 0;
      const allRowErrors: RowError[] = [];

      for (let offset = 0; offset < allRows.length; offset += CHUNK_SIZE) {
        const chunk = allRows.slice(offset, offset + CHUNK_SIZE);
        setProgress(`Importing… ${offset} of ${totalRows} row(s) processed.`);
        const res = await fetch("/api/coordinator/historical-grades/import", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, rows: chunk, rowOffset: offset }),
        });
        let data: any;
        try { data = await res.json(); } catch {
          setError(`The server didn't return a valid response partway through (row ${offset}). ${totalImported} row(s) were imported before this happened — duplicate rows are skipped automatically, so it's safe to just try again.`);
          setLoading(false);
          setResult({ imported: totalImported, totalRows, rowErrors: allRowErrors });
          return;
        }
        if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
        totalImported += data.imported;
        allRowErrors.push(...data.rowErrors);
      }

      setResult({ imported: totalImported, totalRows, rowErrors: allRowErrors });
      setProgress("");
      if (mode === "file") setFile(null); else setCsvText("");
      setLoading(false);
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Which Batch?</h3>
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)} style={{ fontSize: 12.5, padding: "5px 8px", border: "1px solid var(--line)" }}>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
        </select>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 6 }}>Every row in the file is matched to a student by Roll Number within this batch.</p>
      </div>

      {progress && <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>{progress}</p></div>}

      {result && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Result</h3>
          <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
            {result.imported} of {result.totalRows} row(s) imported (duplicates of an existing record are skipped automatically).
          </div>
          {result.rowErrors.length > 0 && (
            <>
              <p style={{ fontSize: 12.5, color: "var(--rust)", fontWeight: 600, marginBottom: 6 }}>{result.rowErrors.length} row(s) could not be imported:</p>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}><th style={{ padding: "4px 8px" }}>Row</th><th>Roll No.</th><th>Course</th><th>Problem</th></tr></thead>
                <tbody>
                  {result.rowErrors.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "4px 8px" }}>{e.row}</td><td>{e.rollNumber}</td><td>{e.courseCode}</td>
                      <td style={{ color: "var(--rust)" }}>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Upload an Excel or CSV File</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>
          Columns, in order: Roll Number, Course Code, Course Title, Credit Hours, Grade, Term Name, Term Year
          (e.g. <code>2022-CS-014, CS101, Introduction to Programming, 3, B+, Fall, 2022</code>). A header row is
          fine — it's detected and skipped automatically. Use grade <code>W</code> for a withdrawn/dropped course
          (it won't affect GPA but will still show on Courses Remaining).
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12.5, marginBottom: 10, display: "block" }} />
        <button onClick={() => runImport("file")} disabled={loading || !file} className="btn btn-brass">{loading ? "Importing…" : "Import File"}</button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Or Paste Data Directly</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>One row per line, comma or tab separated, same column order as above.</p>
        <textarea
          value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8}
          placeholder={"2022-CS-014, CS101, Introduction to Programming, 3, B+, Fall, 2022\n2022-CS-015, CS101, Introduction to Programming, 3, F, Fall, 2022"}
          style={{ width: "100%", padding: 8, border: "1px solid var(--line)", fontFamily: "monospace", fontSize: 12.5 }}
        />
        <button onClick={() => runImport("paste")} disabled={loading || !csvText.trim()} className="btn btn-brass" style={{ marginTop: 10 }}>{loading ? "Importing…" : "Import Pasted Text"}</button>
      </div>
    </>
  );
}
