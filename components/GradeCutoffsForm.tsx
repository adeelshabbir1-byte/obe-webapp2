"use client";

import { useState } from "react";

type ScaleEntry = { letter: string; gpaValue: number };
type SavedCutoff = { letter: string; minPercent: number };

export default function GradeCutoffsForm({ courseId, apiEndpoint, gradingScale, savedCutoffs, suggestion }: {
  courseId: string; apiEndpoint: string; gradingScale: ScaleEntry[]; savedCutoffs: SavedCutoff[];
  suggestion: { A: number; B: number; C: number; D: number };
}) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  function defaultFor(letter: string) {
    const saved = savedCutoffs.find((c) => c.letter === letter);
    if (saved) return saved.minPercent;
    if (letter === "A") return suggestion.A;
    if (letter === "B") return suggestion.B;
    if (letter === "C") return suggestion.C;
    if (letter === "D") return suggestion.D;
    if (letter === "F") return 0;
    return "";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setOk(false); setError("");
    const fd = new FormData(e.currentTarget);
    const cutoffs = gradingScale.map((s) => ({ letter: s.letter, minPercent: parseFloat(fd.get(`cutoff-${s.letter}`) as string) || 0 }));
    try {
      const res = await fetch(apiEndpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cutoffs }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (gradingScale.length === 0) {
    return <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>Your Program Coordinator hasn't defined a grading scale yet.</p></div>;
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Grade Cutoffs</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>
        Minimum % needed for each letter — pre-filled with the computed suggestion for A/B/C/D, fully editable. Once saved, these are what's actually used to assign grades.
      </p>
      {ok && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>Saved.</div>}
      {error && <div className="err">{error}</div>}
      <form onSubmit={onSubmit}>
        <table>
          <thead><tr><th>Letter</th><th>GPA</th><th>Min %</th></tr></thead>
          <tbody>
            {gradingScale.map((s) => (
              <tr key={s.letter}>
                <td style={{ fontWeight: 600 }}>{s.letter}</td><td>{s.gpaValue.toFixed(2)}</td>
                <td><input name={`cutoff-${s.letter}`} type="number" step="0.1" min={0} max={100} defaultValue={defaultFor(s.letter)} style={{ width: 80, padding: "4px 6px", border: "1px solid var(--line)" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" disabled={loading} className="btn btn-brass" style={{ marginTop: 10 }}>{loading ? "Saving…" : "Save Cutoffs"}</button>
      </form>
    </div>
  );
}
