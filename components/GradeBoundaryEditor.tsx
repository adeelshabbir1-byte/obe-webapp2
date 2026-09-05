"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Student = { name: string; rollNumber: string; totalPct: number };
type ScaleEntry = { letter: string; gpaValue: number };

const HEIGHT = 620;

export default function GradeBoundaryEditor({ apiEndpoint, students, gradingScale, initialCutoffs }: {
  apiEndpoint: string; students: Student[]; gradingScale: ScaleEntry[]; initialCutoffs: Record<string, number>;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [cutoffs, setCutoffs] = useState<Record<string, number>>(initialCutoffs);
  const [dragging, setDragging] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...students].sort((a, b) => b.totalPct - a.totalPct);
  const maxScore = Math.max(100, ...sorted.map((s) => s.totalPct));
  const minScore = Math.min(0, ...sorted.map((s) => s.totalPct));
  const range = maxScore - minScore || 1;

  function pctToY(pct: number) {
    return ((maxScore - pct) / range) * HEIGHT;
  }
  function yToPct(y: number) {
    return Math.round(((maxScore - (y / HEIGHT) * range)) * 10) / 10;
  }

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = Math.max(0, Math.min(HEIGHT, e.clientY - rect.top));
    setCutoffs((prev) => ({ ...prev, [dragging]: yToPct(y) }));
  }, [dragging]);

  function onMouseUp() { setDragging(null); }

  async function save() {
    setLoading(true); setError("");
    try {
      const payload = gradingScale.map((s) => ({ letter: s.letter, minPercent: cutoffs[s.letter] ?? 0 }));
      const res = await fetch(apiEndpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cutoffs: payload }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (gradingScale.length === 0) {
    return <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>Your Program Coordinator hasn't defined a grading scale yet.</p></div>;
  }
  if (students.length === 0) {
    return <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>No marks entered yet — nothing to plot.</p></div>;
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Set Grade Boundaries Visually</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
        Every student, highest to lowest score. Drag a boundary line into a gap between students to set that
        grade's cutoff there.
      </p>
      {error && <div className="err">{error}</div>}
      <div
        ref={containerRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ position: "relative", height: HEIGHT, border: "1px solid var(--line)", background: "var(--paper)", userSelect: dragging ? "none" : undefined, overflow: "hidden" }}
      >
        {sorted.map((s, i) => {
          const y = pctToY(s.totalPct);
          return (
            <div key={i} style={{ position: "absolute", top: y - 6, left: 4, right: 4, height: 12, display: "flex", alignItems: "center" }}>
              <div style={{ width: `${Math.max(2, s.totalPct)}%`, maxWidth: "70%", height: 7, background: "var(--brass)", opacity: 0.55, borderRadius: 2 }} />
              <span style={{ fontSize: 9, marginLeft: 6, color: "var(--slate)", whiteSpace: "nowrap" }}>{s.rollNumber} — {s.totalPct}%</span>
            </div>
          );
        })}

        {gradingScale.map((g) => {
          const y = pctToY(cutoffs[g.letter] ?? 0);
          return (
            <div
              key={g.letter}
              onMouseDown={() => setDragging(g.letter)}
              style={{ position: "absolute", top: y - 9, left: 0, right: 0, height: 18, cursor: "ns-resize", display: "flex", alignItems: "center", zIndex: 10 }}
            >
              <div style={{ flex: 1, borderTop: "2px dashed var(--rust)" }} />
              <span style={{ background: "var(--rust)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, marginLeft: 6, cursor: "ns-resize" }}>
                {g.letter}: {Math.round((cutoffs[g.letter] ?? 0) * 10) / 10}%
              </span>
            </div>
          );
        })}
      </div>
      <button onClick={save} disabled={loading} className="btn btn-brass" style={{ marginTop: 12 }}>{loading ? "Saving…" : "Save Boundaries"}</button>
    </div>
  );
}
