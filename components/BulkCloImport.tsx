"use client";

import { useRef, useState } from "react";

type Batch = { id: string; label: string; courses: number; withClos: number };
type Result = { coursesDone: number; added: number; updated: number; removed: number; mappingsAdded: number; errors: string[]; skipped: string[]; untouched: string[] };

export default function BulkCloImport({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState(batches[0]?.id || "");
  const [removeMissing, setRemoveMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const b = batches.find((x) => x.id === batchId);

  async function upload(file: File) {
    setBusy(true); setError(""); setResult(null);
    const fd = new FormData(); fd.append("file", file); fd.append("batchId", batchId); if (removeMissing) fd.append("removeMissing", "1");
    try {
      const res = await fetch("/api/clo-bulk/import", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || "Import failed."); else setResult(d);
    } catch { setError("Import failed."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  if (batches.length === 0) return <div className="card">No batch to work on yet. Create a degree program and batch first.</div>;
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>1. Choose the batch</h3>
        <select value={batchId} onChange={(e) => { setBatchId(e.target.value); setResult(null); }} style={{ padding: "6px 8px", minWidth: 320 }}>
          {batches.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        {b && <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--slate)" }}>{b.courses} course(s), {b.withClos} with CLOs already</span>}

        <h3>2. Download the template</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -6 }}>One Excel file for the whole batch: every course with its current CLOs, a sheet of the batch&apos;s PLOs and short instructions. Fill in or correct the CLOs and their PLO numbers.</p>
        <a className="btn" href={`/api/clo-bulk/export?batchId=${batchId}`}>Download Excel template</a>

        <h3>3. Upload it back</h3>
        <label style={{ display: "block", fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} /> Remove CLOs that are not in the file
          <span style={{ color: "var(--slate)" }}> (only for courses in the file; CLOs already used by lecture topics are kept)</span>
        </label>
        <button className="btn btn-brass" disabled={busy || !batchId} onClick={() => input.current?.click()}>{busy ? "Importing… (this can take a minute)" : "Upload filled template"}</button>
        <input ref={input} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {result && (
        <div className="card">
          <h3 style={{ marginTop: 0, color: "var(--sage)" }}>Imported</h3>
          <p style={{ fontSize: 13.5 }}>
            <b>{result.coursesDone}</b> course(s) updated: <b>{result.added}</b> CLO(s) added, <b>{result.updated}</b> updated{result.removed ? <>, <b>{result.removed}</b> removed</> : null}.
            {" "}<b>{result.mappingsAdded}</b> new course-to-PLO link(s) added to the PLO–Course matrix.
          </p>
          {result.skipped.length > 0 && <><b style={{ fontSize: 13 }}>Skipped</b><ul style={{ fontSize: 12.5, marginTop: 4 }}>{result.skipped.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {result.errors.length > 0 && <><b style={{ fontSize: 13, color: "#b3261e" }}>Rows not imported</b><ul style={{ fontSize: 12.5, marginTop: 4, color: "#b3261e" }}>{result.errors.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {result.untouched.length > 0 && <p style={{ fontSize: 12, color: "var(--slate)" }}>Not in the file (left as they were): {result.untouched.join(", ")}</p>}
        </div>
      )}
    </>
  );
}
