"use client";
import { useState } from "react";

const CHUNK_SIZE = 50;

type RowError = { row: number; name: string; rollNumber: string; batchName: string; reason: string };
type ParsedRow = { name: string; rollNumber: string; batchName: string };

export default function BulkStudentUpload({ batches }: { batches: { degreeProgram: string; batchName: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; activated: number; totalRows: number; rowErrors: RowError[] } | null>(null);

  async function runImport(mode: "file" | "paste") {
    setLoading(true); setError(""); setResult(null); setProgress("");
    try {
      // Step 1: parse the file/text into rows — fast, no database work.
      const parseFd = new FormData();
      if (mode === "file") {
        if (!file) { setLoading(false); return; }
        parseFd.append("file", file);
      } else {
        if (!csvText.trim()) { setLoading(false); return; }
        parseFd.append("csvText", csvText);
      }
      setProgress("Reading file…");
      const parseRes = await fetch("/api/coordinator/students/import-multi-batch/parse", { method: "POST", body: parseFd });
      const parseData = await parseRes.json();
      if (!parseRes.ok) { setError(parseData.error || "Something went wrong reading the file."); setLoading(false); return; }

      const allRows: ParsedRow[] = parseData.rows;
      const totalRows = allRows.length;

      // Step 2: process in small chunks so no single request has to do
      // database work for hundreds of rows and risk a serverless timeout.
      let totalImported = 0;
      let totalActivated = 0;
      const allRowErrors: RowError[] = [];

      for (let offset = 0; offset < allRows.length; offset += CHUNK_SIZE) {
        const chunk = allRows.slice(offset, offset + CHUNK_SIZE);
        setProgress(`Importing… ${offset} of ${totalRows} row(s) processed.`);
        const res = await fetch("/api/coordinator/students/import-multi-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk, rowOffset: offset }),
        });
        let data: any;
        try {
          data = await res.json();
        } catch {
          setError(`The server didn't return a valid response partway through (row ${offset}). ${totalImported} row(s) were imported before this happened. Everything already imported uses upsert on roll number, so it's safe to just try the import again — matching rows will simply update in place rather than duplicate.`);
          setLoading(false);
          setResult({ imported: totalImported, activated: totalActivated, totalRows, rowErrors: allRowErrors });
          return;
        }
        if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }

        totalImported += data.imported;
        totalActivated += data.activated;
        allRowErrors.push(...data.rowErrors);
      }

      setResult({ imported: totalImported, activated: totalActivated, totalRows, rowErrors: allRowErrors });
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
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Your Batches (for reference)</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>
          The Batch Name column in your upload must match one of these exactly (not case-sensitive).
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {batches.map((b, i) => (
            <span key={i} style={{ fontSize: 11.5, background: "#F2EEE6", padding: "3px 9px", borderRadius: 3 }}>
              {b.batchName} <span style={{ color: "var(--slate)" }}>({b.degreeProgram})</span>
            </span>
          ))}
        </div>
      </div>

      {progress && (
        <div className="card">
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>{progress}</p>
        </div>
      )}

      {result && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Result</h3>
          <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
            {result.imported} of {result.totalRows} row(s) imported. {result.activated} new login(s) activated — those students' initial password is their own roll number, and they'll be asked to set a real one on first sign-in at <code>/student/login</code>.
          </div>
          {result.rowErrors.length > 0 && (
            <>
              <p style={{ fontSize: 12.5, color: "var(--rust)", fontWeight: 600, marginBottom: 6 }}>{result.rowErrors.length} row(s) could not be imported:</p>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}><th style={{ padding: "4px 8px" }}>Row</th><th>Name</th><th>Roll No.</th><th>Batch Name (as typed)</th><th>Problem</th></tr></thead>
                <tbody>
                  {result.rowErrors.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "4px 8px" }}>{e.row}</td><td>{e.name}</td><td>{e.rollNumber}</td><td>{e.batchName}</td>
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
          Column A = Name, Column B = Roll Number, Column C = Batch Name. Students from any number of your
          batches can be mixed in the same file. A header row is fine — it's detected and skipped automatically.
          Large files are processed in small batches automatically — leave the page open until it finishes.
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12.5, marginBottom: 10, display: "block" }} />
        <button onClick={() => runImport("file")} disabled={loading || !file} className="btn btn-brass">{loading ? "Importing…" : "Import File"}</button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Or Paste Student Data Directly</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>One student per line, as "Name, Roll Number, Batch Name" (comma or tab separated).</p>
        <textarea
          value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8}
          placeholder={"Ali Khan, 2026-CS-001, BSCS Fall 2026\nSara Ahmed, 2026-AI-014, BSAI Fall 2026"}
          style={{ width: "100%", padding: 8, border: "1px solid var(--line)", fontFamily: "monospace", fontSize: 12.5 }}
        />
        <button onClick={() => runImport("paste")} disabled={loading || !csvText.trim()} className="btn btn-brass" style={{ marginTop: 10 }}>{loading ? "Importing…" : "Import Pasted Text"}</button>
      </div>
    </>
  );
}
