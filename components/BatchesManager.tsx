"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Batch = { id: string; degreeProgram: string; batchName: string; startTerm: string; startYear: number; studentCount: number; courseCount: number };

export default function BatchesManager({ initialBatches }: { initialBatches: Batch[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addBatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          degreeProgram: fd.get("degreeProgram"), batchName: fd.get("batchName"),
          startTerm: fd.get("startTerm"), startYear: fd.get("startYear"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveStudentCount(batchId: string, value: string) {
    setBusyId(batchId); setError("");
    try {
      const res = await fetch(`/api/coordinator/batches/${batchId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentCount: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setEditingCountId(null); setBusyId(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <SortableTable>
          <thead><tr><th>Degree Program</th><th>Batch</th><th>Semester 1 Starts</th><th>Students</th><th>Courses Imported</th><th></th></tr></thead>
          <tbody>
            {initialBatches.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No batches yet.</td></tr>}
            {initialBatches.map((b) => (
              <tr key={b.id}>
                <td>{b.degreeProgram}</td><td>{b.batchName}</td><td>{b.startTerm} {b.startYear}</td>
                <td>
                  {editingCountId === b.id ? (
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="number" min={0} defaultValue={b.studentCount} disabled={busyId === b.id}
                        onKeyDown={(e) => { if (e.key === "Enter") saveStudentCount(b.id, (e.target as HTMLInputElement).value); }}
                        style={{ width: 70, padding: "4px 6px", border: "1px solid var(--line)" }}
                        id={`count-${b.id}`}
                      />
                      <button onClick={() => saveStudentCount(b.id, (document.getElementById(`count-${b.id}`) as HTMLInputElement).value)} disabled={busyId === b.id} className="btn btn-brass" style={{ padding: "3px 8px", fontSize: 11 }}>Save</button>
                    </span>
                  ) : (
                    <span>{b.studentCount} <button onClick={() => setEditingCountId(b.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 11, textDecoration: "underline", cursor: "pointer", marginLeft: 6 }}>Edit</button></span>
                  )}
                </td>
                <td>{b.courseCount}</td>
                <td><a href={`/coordinator/courses?batchId=${b.id}`} style={{ color: "var(--brass-dark)", fontSize: 12 }}>View Courses</a></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          Student count can change each semester as students leave or migrate in — update it whenever it changes.
        </p>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Create Batch</h3>
        <form onSubmit={addBatch}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            <div className="field"><label>Degree Program</label><input name="degreeProgram" placeholder="BS Computer Science" defaultValue="BS Computer Science" required /></div>
            <div className="field"><label>Batch Name</label><input name="batchName" placeholder="Fall 2026" required /></div>
            <div className="field">
              <label>Semester 1 Term</label>
              <select name="startTerm" required>
                <option value="Fall">Fall</option>
                <option value="Spring">Spring</option>
              </select>
            </div>
            <div className="field"><label>Semester 1 Year</label><input name="startYear" type="number" defaultValue={new Date().getFullYear()} required /></div>
          </div>
          <p style={{ fontSize: 11, color: "var(--slate)", marginTop: -8, marginBottom: 12 }}>
            This is when the batch's Semester 1 begins — used to automatically figure out which semester they're in as terms pass.
          </p>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Batch"}</button>
        </form>
      </div>
    </>
  );
}
