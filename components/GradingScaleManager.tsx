"use client";

import { useState } from "react";

type ScaleEntry = { id: string; letter: string; gpaValue: number; orderIndex: number; effectiveFromTerm: string; effectiveFromYear: number };

export default function GradingScaleManager({ initialScale: initialScaleProp }: { initialScale: ScaleEntry[] }) {
  const [initialScale, setScale] = useState<ScaleEntry[]>(initialScaleProp);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const versions = new Map<string, ScaleEntry[]>();
  for (const s of initialScale) {
    const key = `${s.effectiveFromTerm} ${s.effectiveFromYear}`;
    versions.set(key, [...(versions.get(key) || []), s]);
  }
  const versionKeys = Array.from(versions.keys()).sort().reverse();

  async function addOrUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/grading-scale", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: fd.get("letter"), gpaValue: fd.get("gpaValue"),
          effectiveFromTerm: fd.get("effectiveFromTerm"), effectiveFromYear: fd.get("effectiveFromYear"),
          orderIndex: initialScale.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      // Adding a letter that already exists for the same effective-from term/year updates it in place instead.
      setScale((prev) => {
        const idx = prev.findIndex((s) => s.letter === data.entry.letter && s.effectiveFromTerm === data.entry.effectiveFromTerm && s.effectiveFromYear === data.entry.effectiveFromYear);
        if (idx === -1) return [...prev, data.entry];
        const next = [...prev]; next[idx] = data.entry; return next;
      });
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function remove(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/grading-scale/${id}`, { method: "DELETE" });
    setScale((prev) => prev.filter((s) => s.id !== id));
    setLoading(false);
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      {versionKeys.length === 0 && (
        <div className="card"><p style={{ color: "var(--slate)" }}>No grading scale defined yet — add letters below.</p></div>
      )}
      {versionKeys.map((key) => (
        <div key={key} className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>
            Effective from {key}
            {key === versionKeys[0] && <span style={{ fontSize: 11, color: "var(--sage)", marginLeft: 8 }}>(current / most recent)</span>}
          </h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
            Applies to any batch whose own start term is on or after this point — batches that started earlier
            keep whichever scale was in effect for them.
          </p>
          <table>
            <thead><tr><th>Letter</th><th>GPA Value</th><th></th></tr></thead>
            <tbody>
              {versions.get(key)!.sort((a, b) => a.orderIndex - b.orderIndex).map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.letter}</td><td>{s.gpaValue.toFixed(2)}</td>
                  <td><button onClick={() => remove(s.id)} disabled={loading} className="act act-danger">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Add / Update a Letter Grade</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          To introduce a new scale (e.g. after an HEC policy change) without affecting batches already running
          under the old one, set an "Effective From" term/year here that's later than your existing version(s) —
          it becomes its own version, applying only to batches starting from that point on.
        </p>
        <form onSubmit={addOrUpdate} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Letter</label><input name="letter" placeholder="e.g. A, A-, B+" required style={{ width: 100 }} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>GPA Value</label><input name="gpaValue" type="number" step="0.01" min={0} max={4} placeholder="e.g. 4.0" required style={{ width: 100 }} /></div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Effective From Term</label>
            <select name="effectiveFromTerm" defaultValue="Fall"><option value="Fall">Fall</option><option value="Spring">Spring</option></select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}><label>Effective From Year</label><input name="effectiveFromYear" type="number" defaultValue={new Date().getFullYear()} style={{ width: 100 }} /></div>
          <button type="submit" disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
        </form>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>Adding a letter that already exists for the same effective-from term/year updates its GPA value instead of duplicating it.</p>
      </div>
    </>
  );
}
