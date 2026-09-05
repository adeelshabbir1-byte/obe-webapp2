"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ScaleEntry = { id: string; letter: string; gpaValue: number; orderIndex: number };

export default function GradingScaleManager({ initialScale }: { initialScale: ScaleEntry[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function addOrUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/grading-scale", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letter: fd.get("letter"), gpaValue: fd.get("gpaValue"), orderIndex: initialScale.length }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function remove(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/grading-scale/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Letter</th><th>GPA Value</th><th></th></tr></thead>
          <tbody>
            {initialScale.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No grading scale defined yet — add letters below.</td></tr>}
            {initialScale.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.letter}</td><td>{s.gpaValue.toFixed(2)}</td>
                <td><button onClick={() => remove(s.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Add / Update a Letter Grade</h3>
        <form onSubmit={addOrUpdate} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Letter</label><input name="letter" placeholder="e.g. A, A-, B+" required style={{ width: 100 }} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>GPA Value</label><input name="gpaValue" type="number" step="0.01" min={0} max={4} placeholder="e.g. 4.0" required style={{ width: 100 }} /></div>
          <button type="submit" disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
        </form>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>Adding a letter that already exists updates its GPA value instead of duplicating it.</p>
      </div>
    </>
  );
}
