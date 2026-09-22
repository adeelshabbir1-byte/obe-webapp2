"use client";

import { useState, useRef, useCallback } from "react";

type Student = { name: string; rollNumber: string; totalPct: number };
type ScaleEntry = { letter: string; gpaValue: number };

const HEIGHT = 420;
const BAR_GAP = 3;

export default function GradeBoundaryEditor({ apiEndpoint, students, gradingScale, initialCutoffs }: {
  apiEndpoint: string; students: Student[]; gradingScale: ScaleEntry[]; initialCutoffs: Record<string, number>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cutoffs, setCutoffs] = useState<Record<string, number>>(initialCutoffs);
  const [dragging, setDragging] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...students].sort((a, b) => b.totalPct - a.totalPct);
  const maxScore = Math.max(100, ...sorted.map((s) => s.totalPct));
  const minScore = Math.min(0, ...sorted.map((s) => s.totalPct));
  const range = maxScore - minScore || 1;

  // Y is measured from the TOP of the chart (0 = maxScore, HEIGHT = minScore).
  function pctToY(pct: number) {
    return ((maxScore - pct) / range) * HEIGHT;
  }
  function yToPct(y: number) {
    return Math.round((maxScore - (y / HEIGHT) * range) * 10) / 10;
  }

  // Grades ordered by GPA value, highest first — used to stop a boundary
  // being dragged past its neighbors (A- can never cross A or B+, etc.).
  const orderedScale = [...gradingScale].sort((a, b) => b.gpaValue - a.gpaValue);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = Math.max(0, Math.min(HEIGHT, e.clientY - rect.top));
    let next = yToPct(y);

    const idx = orderedScale.findIndex((s) => s.letter === dragging);
    const higher = orderedScale[idx - 1]; // next grade up (e.g. "A" if dragging "A-")
    const lower = orderedScale[idx + 1];  // next grade down (e.g. "B+" if dragging "A-")
    setCutoffs((prev) => {
      const higherCutoff = higher ? prev[higher.letter] : undefined;
      const lowerCutoff = lower ? prev[lower.letter] : undefined;
      if (higherCutoff !== undefined) next = Math.min(next, higherCutoff - 0.1);
      if (lowerCutoff !== undefined) next = Math.max(next, lowerCutoff + 0.1);
      return { ...prev, [dragging]: Math.round(next * 10) / 10 };
    });
  }, [dragging, orderedScale]);

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
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (gradingScale.length === 0) {
    return <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>Your Program Coordinator hasn't defined a grading scale yet.</p></div>;
  }
  if (students.length === 0) {
    return <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>No marks entered yet — nothing to plot.</p></div>;
  }

  const barWidth = Math.max(3, Math.min(22, 700 / sorted.length - BAR_GAP));

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Set Grade Boundaries Visually</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
        Every student's mark as a vertical bar, sorted highest to lowest, left to right. Drag a horizontal
        boundary line into a gap between bars to set that grade's cutoff there.
      </p>
      {error && <div className="err">{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <div
          ref={containerRef}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            position: "relative", height: HEIGHT, minWidth: sorted.length * (barWidth + BAR_GAP) + 20,
            border: "1px solid var(--line)", background: "var(--paper)",
            userSelect: dragging ? "none" : undefined,
          }}
        >
          {sorted.map((s, i) => {
            const barTop = pctToY(s.totalPct);
            const x = 10 + i * (barWidth + BAR_GAP);
            return (
              <div key={i} style={{ position: "absolute", left: x, top: barTop, width: barWidth, height: HEIGHT - barTop, background: "var(--brass)", opacity: 0.55, borderRadius: "2px 2px 0 0" }} title={`${s.rollNumber} — ${s.totalPct}%`} />
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
                <span style={{ background: "var(--rust)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, marginRight: 6, cursor: "ns-resize" }}>
                  {g.letter}: {Math.round((cutoffs[g.letter] ?? 0) * 10) / 10}%
                </span>
                <div style={{ flex: 1, borderTop: "2px dashed var(--rust)" }} />
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={save} disabled={loading} className="btn btn-brass" style={{ marginTop: 12 }}>{loading ? "Saving…" : "Save Boundaries"}</button>
    </div>
  );
}
