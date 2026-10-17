"use client";
import { useState } from "react";

type Row = { row: number; name: string; email: string; department: string; employmentType: string; status: "NEW" | "UPDATE" | "ERROR"; reason?: string; [k: string]: unknown };
const tempPassword = () => `Obe@${Math.floor(100000 + Math.random() * 900000)}`;

// Employee Excel upload: download template → fill → upload → preview (new / update / errors) → confirm.
export default function EmployeeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ created: number; updated: number; other: { email: string; status: string; note?: string }[]; password: string } | null>(null);

  async function preview() {
    if (!file) return;
    setBusy(true); setErr(""); setRows(null); setResult(null);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/employees/import", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Could not read the file."); return; }
    setRows(d.rows);
  }
  async function save() {
    if (!rows) return;
    const good = rows.filter((x) => x.status !== "ERROR");
    const password = tempPassword();
    setBusy(true); setErr("");
    const all: { email: string; status: string; note?: string }[] = [];
    for (let i = 0; i < good.length; i += 25) {
      const r = await fetch("/api/employees/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: good.slice(i, i + 25), password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(`${d.error || "Saving stopped"} after ${all.length} rows. Uploading the same file again is safe.`); break; }
      all.push(...d.done);
    }
    setBusy(false);
    setResult({ created: all.filter((x) => x.status === "CREATED").length, updated: all.filter((x) => x.status === "UPDATED").length, other: all.filter((x) => !["CREATED", "UPDATED"].includes(x.status)), password });
    setRows(null);
  }
  const n = (s: string) => rows?.filter((x) => x.status === s).length || 0;
  const tone: Record<string, string> = { NEW: "#1F5E36", UPDATE: "#1B4F8A", ERROR: "#B3261E" };

  return (
    <div className="card">
      <ol style={{ fontSize: 13, margin: "0 0 12px 18px" }}>
        <li><a href="/api/employees/template" className="btn btn-secondary btn-sm">Download Excel template</a> — required: Name, Email, Department, Employment Type (Permanent / Visiting / Contract).</li>
        <li style={{ marginTop: 6 }}>Fill it in (or paste an export from your HR / ERP system), then choose the file: <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} /> <button className="btn btn-sm" disabled={!file || busy} onClick={preview}>{busy && !rows ? "Reading…" : "Check file"}</button></li>
        <li style={{ marginTop: 6 }}>Review the preview and press <b>Save</b>. Nothing is saved before that.</li>
      </ol>
      {err && <div className="err">{err}</div>}
      {rows && (
        <>
          <div style={{ fontSize: 13, margin: "8px 0" }}><b style={{ color: tone.NEW }}>{n("NEW")} new</b> · <b style={{ color: tone.UPDATE }}>{n("UPDATE")} already in the system (will be updated)</b> · <b style={{ color: tone.ERROR }}>{n("ERROR")} with errors (skipped)</b></div>
          <div style={{ maxHeight: 380, overflow: "auto" }}>
            <table>
              <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Department</th><th>Type</th><th>Result</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.name}</td><td>{r.email}</td><td>{r.department}</td><td>{r.employmentType}</td><td style={{ color: tone[r.status], fontWeight: 600 }}>{r.status === "NEW" ? "New" : r.status === "UPDATE" ? "Update" : r.reason}</td></tr>)}</tbody>
            </table>
          </div>
          <button className="btn btn-brass" style={{ marginTop: 10 }} disabled={busy || n("NEW") + n("UPDATE") === 0} onClick={save}>{busy ? "Saving…" : `Save ${n("NEW") + n("UPDATE")} employees`}</button>
        </>
      )}
      {result && (
        <div style={{ marginTop: 10, fontSize: 13, background: "#E8F3EC", border: "1px solid #BFE0CB", borderRadius: 8, padding: "10px 12px" }}>
          <b>{result.created} accounts created, {result.updated} updated.</b>
          {result.created > 0 && <div style={{ marginTop: 4 }}>New accounts sign in with their <b>email</b> and the temporary password <code style={{ fontSize: 14 }}>{result.password}</code> — they must change it at first sign-in. Note it now; it is not shown again. No emails were sent.</div>}
          {result.other.length > 0 && <div style={{ marginTop: 4, color: "#95650F" }}>Not saved: {result.other.map((o) => `${o.email} (${o.note || o.status})`).join(", ")}</div>}
          <div style={{ marginTop: 4 }}>Next: give roles in the Hierarchy view.</div>
        </div>
      )}
    </div>
  );
}
