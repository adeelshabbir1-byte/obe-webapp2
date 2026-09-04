"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Student = { id: string; name: string; rollNumber: string };
type Batch = { id: string; label: string };

export default function StudentManager({ batches, initialBatchId, students }: { batches: Batch[]; initialBatchId: string; students: Student[] }) {
  const router = useRouter();
  const [batchId, setBatchId] = useState(initialBatchId);
  const [csvText, setCsvText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  function switchBatch(id: string) {
    setBatchId(id);
    router.push(`/coordinator/students?batchId=${id}`);
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
      setCsvText(""); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeStudent(id: string) {
    if (!confirm("Remove this student? This also deletes their marks and enrollments.")) return;
    setLoading(true);
    await fetch(`/api/coordinator/students/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
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
        <table>
          <thead><tr><th>Name</th><th>Roll Number</th><th></th></tr></thead>
          <tbody>
            {students.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No students in this batch yet.</td></tr>}
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{s.rollNumber}</td>
                <td><button onClick={() => removeStudent(s.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Bulk Import Students</h3>
        {result && <div style={{ background: "#CCFBF1", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{result}</div>}
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>Paste one student per line, as "Name, Roll Number" (comma or tab separated) — or paste directly from an Excel column.</p>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8} placeholder={"Ali Khan, 2026-CS-001\nSara Ahmed, 2026-CS-002"} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", fontFamily: "monospace", fontSize: 12.5 }} />
        <button onClick={importCsv} disabled={loading} className="btn btn-brass" style={{ marginTop: 10 }}>{loading ? "Importing…" : "Import Students"}</button>
      </div>
    </>
  );
}
