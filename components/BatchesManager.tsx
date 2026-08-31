"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Batch = { id: string; degreeProgram: string; batchName: string; courseCount: number };

export default function BatchesManager({ initialBatches }: { initialBatches: Batch[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function addBatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ degreeProgram: fd.get("degreeProgram"), batchName: fd.get("batchName") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Degree Program</th><th>Batch</th><th>Courses Imported</th><th></th></tr></thead>
          <tbody>
            {initialBatches.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No batches yet.</td></tr>}
            {initialBatches.map((b) => (
              <tr key={b.id}>
                <td>{b.degreeProgram}</td><td>{b.batchName}</td><td>{b.courseCount}</td>
                <td><a href={`/coordinator/courses?batchId=${b.id}`} style={{ color: "var(--brass-dark)", fontSize: 12 }}>View Courses</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Create Batch</h3>
        <form onSubmit={addBatch}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field"><label>Degree Program</label><input name="degreeProgram" placeholder="BS Computer Science" defaultValue="BS Computer Science" required /></div>
            <div className="field"><label>Batch Name</label><input name="batchName" placeholder="Fall 2026" required /></div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Batch"}</button>
        </form>
      </div>
    </>
  );
}
