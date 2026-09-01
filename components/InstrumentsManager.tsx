"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Instrument = { id: string; type: string; label: string; marksPct: number };
type Targets = { assignmentPct: number; quizPct: number; midtermPct: number; finalPct: number; projectPct: number; labPct: number };

const TYPES = ["Quiz", "Assignment", "Midterm", "Final", "Project", "Lab"];
const TARGET_KEY: Record<string, keyof Targets> = {
  Quiz: "quizPct", Assignment: "assignmentPct", Midterm: "midtermPct", Final: "finalPct", Project: "projectPct", Lab: "labPct",
};

export default function InstrumentsManager({ courseId, initialInstruments, targets }: { courseId: string; initialInstruments: Instrument[]; targets: Targets }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function addInstrument(type: string, nextLabel: string, marksPct: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/instruments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, label: nextLabel, marksPct }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeInstrument(id: string) {
    setLoading(true);
    await fetch(`/api/subjectexpert/courses/${courseId}/instruments/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {TYPES.map((type) => {
        const items = initialInstruments.filter((i) => i.type === type);
        const sum = items.reduce((s, i) => s + i.marksPct, 0);
        const target = targets[TARGET_KEY[type]];
        const mismatch = items.length > 0 && sum !== target;
        const isNumbered = type === "Midterm" || type === "Final";
        const nextLabel = isNumbered ? String(items.length + 1) : `${type} ${items.length + 1}`;
        return (
          <div className="card" key={type}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 14 }}>{type}</h3>
              <span style={{ fontSize: 11.5, color: mismatch ? "var(--rust)" : "var(--slate)" }}>
                {sum}% defined {target ? `(target from Assessment Weights: ${target}%)` : ""}
                {mismatch && <span style={{ marginLeft: 6, fontWeight: 600 }}>— doesn't match</span>}
              </span>
            </div>
            <table>
              <thead><tr><th>{isNumbered ? "Question #" : "Label"}</th><th>Marks %</th><th></th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None defined yet.</td></tr>}
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{isNumbered ? `Q${i.label}` : i.label}</td><td>{i.marksPct}%</td>
                    <td><button onClick={() => removeInstrument(i.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AddInstrumentRow type={type} nextLabel={nextLabel} loading={loading} onAdd={addInstrument} />
          </div>
        );
      })}
    </>
  );
}

function AddInstrumentRow({ type, nextLabel, loading, onAdd }: { type: string; nextLabel: string; loading: boolean; onAdd: (type: string, label: string, marksPct: string) => void }) {
  const [marksPct, setMarksPct] = useState("");
  const isNumbered = type === "Midterm" || type === "Final";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!marksPct) return;
    onAdd(type, nextLabel, marksPct);
    setMarksPct("");
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
      <div style={{ fontSize: 12.5, color: "var(--slate)" }}>
        Next: <b style={{ color: "var(--ink)" }}>{isNumbered ? `Q${nextLabel}` : nextLabel}</b>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Marks %</label>
        <input value={marksPct} onChange={(e) => setMarksPct(e.target.value)} type="number" min={0} max={100} required style={{ padding: "6px 8px", border: "1px solid var(--line)", width: 70 }} />
      </div>
      <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "6px 12px", fontSize: 12 }}>Add {isNumbered ? `Q${nextLabel}` : nextLabel}</button>
    </form>
  );
}
