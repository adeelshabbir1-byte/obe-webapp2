"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Student = { id: string; name: string; rollNumber: string };
type Batch = { id: string; label: string };

export default function StudentManager({ batches, initialBatchId, students: initialStudents }: { batches: Batch[]; initialBatchId: string; students: Student[] }) {
  const router = useRouter();
  const [batchId, setBatchId] = useState(initialBatchId);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [csvText, setCsvText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [activatingLogins, setActivatingLogins] = useState(false);
  const [loginActivationResult, setLoginActivationResult] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  function switchBatch(id: string) {
    setBatchId(id);
    router.push(`/coordinator/students?batchId=${id}`);
  }

  async function importFile() {
    if (!file) return;
    setLoading(true); setError(""); setResult("");
    try {
      const fd = new FormData();
      fd.append("batchId", batchId); fd.append("file", file);
      const res = await fetch("/api/coordinator/students/import-file", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResult(`Imported ${data.imported} student(s) from ${file.name}.${data.skipped ? ` Skipped ${data.skipped} row(s).` : ""}`);
      if (data.students) setStudents(data.students);
      setFile(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function importCsv() {
    if (!csvText.trim()) return;
    setLoading(true); setError(""); setResult("");
    try {
      const res = await fetch("/api/coordinator/students/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, csvText }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResult(`Imported ${data.imported} student(s).${data.skipped ? ` Skipped ${data.skipped} line(s).` : ""}`);
      if (data.students) setStudents(data.students);
      setCsvText(""); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeStudent(id: string) {
    if (!confirm("Remove this student? This also deletes their marks and enrollments.")) return;
    setLoading(true);
    await fetch(`/api/coordinator/students/${id}`, { method: "DELETE" });
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setLoading(false);
  }

  async function activateLogins(force: boolean) {
    if (force && !confirm("This resets EVERY student's login in this batch back to their roll number, even ones who already set their own password. Continue?")) return;
    setActivatingLogins(true); setLoginActivationResult(""); setError("");
    try {
      const res = await fetch("/api/coordinator/students/activate-logins", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, force }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setActivatingLogins(false); return; }
      setLoginActivationResult(`Activated ${data.activated} student login(s) — their initial password is their own roll number, and they'll be asked to set a new one on first sign-in.`);
      setActivatingLogins(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setActivatingLogins(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Batch</label>
        <select value={batchId} onChange={(e) => switchBatch(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 6 }}>Student Portal Logins</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Students have no email on file, so a login can't be emailed to them — instead, activate their
          account and their initial password becomes their own roll number; they'll be prompted to set a
          real password the first time they sign in at <code>/student/login</code>.
        </p>
        {loginActivationResult && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{loginActivationResult}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => activateLogins(false)} disabled={activatingLogins} className="btn btn-approve" style={{ fontSize: 12, padding: "5px 10px" }}>
            {activatingLogins ? "Activating…" : "Activate New Logins"}
          </button>
          <button onClick={() => activateLogins(true)} disabled={activatingLogins} className="btn btn-warn" style={{ fontSize: 12, padding: "5px 10px" }}>
            Reset Everyone's Login
          </button>
        </div>
      </div>

      <div className="card">
        <SortableTable>
          <thead><tr><th>Name</th><th>Roll Number</th><th></th></tr></thead>
          <tbody>
            {students.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No students in this batch yet.</td></tr>}
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{s.rollNumber}</td>
                <td><button onClick={() => removeStudent(s.id)} disabled={loading} className="act act-danger">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Upload an Excel or CSV File</h3>
        {result && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{result}</div>}
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>
          Column A = Name, Column B = Roll Number. A header row is fine — it's detected and skipped automatically.
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12.5, marginBottom: 10, display: "block" }} />
        <button onClick={importFile} disabled={loading || !file} className="btn btn-import">{loading ? "Importing…" : "Import File"}</button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Or Paste Student Data Directly</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>One student per line, as "Name, Roll Number" (comma or tab separated) — works directly from a copied Excel column.</p>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8} placeholder={"Ali Khan, 2026-CS-001\nSara Ahmed, 2026-CS-002"} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", fontFamily: "monospace", fontSize: 12.5 }} />
        <button onClick={importCsv} disabled={loading || !csvText.trim()} className="btn btn-import" style={{ marginTop: 10 }}>{loading ? "Importing…" : "Import Pasted Text"}</button>
      </div>
    </>
  );
}
