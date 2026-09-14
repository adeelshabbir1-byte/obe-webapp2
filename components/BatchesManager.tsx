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

  async function removeAllBatches() {
    const typed = prompt(`This permanently deletes EVERY batch you have (${initialBatches.length} total) — every course, student, PLO, and all their data across all of them. This cannot be undone.\n\nType exactly: DELETE ALL BATCHES`);
    if (typed !== "DELETE ALL BATCHES") { if (typed !== null) alert("Confirmation phrase didn't match — nothing was deleted."); return; }
    setBusyId("__all__"); setError("");
    try {
      const res = await fetch("/api/coordinator/batches", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE ALL BATCHES" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setBusyId(null);
      if (data.errors) setError(`Deleted ${data.deleted}/${data.total}, but some failed: ${data.errors.join("; ")}`);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function removeBatch(batchId: string, batchName: string) {
    const typed = prompt(`This permanently deletes the "${batchName}" batch — every course, student, PLO, and all their data. This cannot be undone.\n\nType the batch name exactly to confirm: ${batchName}`);
    if (typed !== batchName) { if (typed !== null) alert("Name didn't match — nothing was deleted."); return; }
    setBusyId(batchId); setError("");
    try {
      const res = await fetch(`/api/coordinator/batches/${batchId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setBusyId(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {initialBatches.length > 0 && (
        <div className="card" style={{ borderColor: "var(--rust)", background: "#FFF5F0" }}>
          <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 8 }}>
            <b>Danger zone.</b> Deletes every batch you have ({initialBatches.length} total) and everything under them — permanent, no undo.
          </p>
          <button onClick={removeAllBatches} disabled={busyId === "__all__"} style={{ background: "var(--rust)", color: "#fff", border: "none", padding: "6px 14px", fontSize: 12.5, cursor: "pointer" }}>
            {busyId === "__all__" ? "Deleting…" : "Delete ALL Batches"}
          </button>
        </div>
      )}
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
                <td><a href={`/coordinator/courses?batchId=${b.id}`} style={{ color: "var(--brass-dark)", fontSize: 12 }}>View Courses</a>
                <button onClick={() => removeBatch(b.id, b.batchName)} disabled={busyId === b.id} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", padding: 0, marginLeft: 10 }}>Delete Batch</button></td>
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
