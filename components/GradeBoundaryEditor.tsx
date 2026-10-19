"use client";

import { useState, useRef, useCallback } from "react";

type Student = { name: string; rollNumber: string; totalPct: number };
type ScaleEntry = { letter: string; gpaValue: number };

const HEIGHT = 420;
const BAR_GAP = 3;
const NEAR = 0.5; // a student this close below a boundary is flagged for a second look
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Bell-curve boundaries from the class mean and SD: with up to five letters, D at mean − 2 SD and one SD per letter up
 * (the usual relative scheme); with more letters, evenly spaced from mean − 2 SD (lowest pass) to mean + 1.5 SD (top). */
export function bellCurveCutoffs(scores: number[], scale: ScaleEntry[]): Record<string, number> {
  const n = scores.length;
  const mean = n ? scores.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const ordered = [...scale].sort((a, b) => b.gpaValue - a.gpaValue);
  const pass = ordered.filter((g) => g.gpaValue > 0);
  const out: Record<string, number> = {};
  const k = pass.length;
  pass.forEach((g, i) => {
    const z = k <= 5 ? -2 + (k - 1 - i) : 1.5 - (3.5 * i) / Math.max(1, k - 1);
    out[g.letter] = Math.max(0, Math.min(100, r1(mean + z * sd)));
  });
  for (const g of ordered) if (g.gpaValue <= 0) out[g.letter] = 0;
  // Keep them strictly descending.
  let prev = 101;
  for (const g of ordered) { if (out[g.letter] >= prev) out[g.letter] = r1(prev - 0.1); prev = out[g.letter]; }
  return out;
}

export default function GradeBoundaryEditor({ apiEndpoint, students, gradingScale, initialCutoffs }: {
  apiEndpoint: string; students: Student[]; gradingScale: ScaleEntry[]; initialCutoffs: Record<string, number>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cutoffs, setCutoffs] = useState<Record<string, number>>(initialCutoffs);
  const [dragging, setDragging] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...students].sort((a, b) => b.totalPct - a.totalPct);
  // For every boundary: the lowest student who made it, the highest who didn't, and anyone within 0.5 below it.
  const checks = [...gradingScale].sort((a, b) => b.gpaValue - a.gpaValue).filter((g) => (cutoffs[g.letter] ?? 0) > 0).map((g) => {
    const cut = cutoffs[g.letter] ?? 0;
    const above = sorted.filter((x) => x.totalPct >= cut);
    const below = sorted.filter((x) => x.totalPct < cut);
    const lowestIn = above[above.length - 1] || null, highestOut = below[0] || null;
    const near = below.filter((x) => cut - x.totalPct <= NEAR);
    return { letter: g.letter, cut, lowestIn, highestOut, near };
  });
  const nearAll = checks.flatMap((c) => c.near.map((x) => ({ ...x, letter: c.letter, short: r2(c.cut - x.totalPct) })));
  const nearSet = new Set(nearAll.map((x) => x.rollNumber));
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
    if (nearAll.length && !confirm(`Please check: ${nearAll.length} student(s) are within ${NEAR} marks below a grade boundary:\n\n${nearAll.map((x) => `${x.rollNumber} ${x.name}: ${x.totalPct}% — ${x.short} below ${x.letter}`).join("\n")}\n\nSave these boundaries anyway?`)) return;
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCutoffs(bellCurveCutoffs(sorted.map((x) => x.totalPct), gradingScale))} title="Set every boundary from the class mean and standard deviation">Bell curve</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCutoffs(initialCutoffs)}>Undo changes</button>
      </div>
      {nearAll.length > 0 && (
        <div className="err" style={{ background: "#FFF1F0" }}>
          <b>Please check:</b> {nearAll.length} student{nearAll.length > 1 ? "s are" : " is"} within {NEAR} marks below a boundary —{" "}
          {nearAll.map((x) => `${x.rollNumber} ${x.name} ${x.totalPct}% (${x.short} below ${x.letter})`).join("; ")}. They show red in the chart.
        </div>
      )}
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
              <div key={i} style={{ position: "absolute", left: x, top: barTop, width: barWidth, height: HEIGHT - barTop, background: nearSet.has(s.rollNumber) ? "#c93c3c" : "var(--brass)", opacity: nearSet.has(s.rollNumber) ? 0.9 : 0.55, borderRadius: "2px 2px 0 0" }} title={`${s.rollNumber} ${s.name} — ${s.totalPct}%${nearSet.has(s.rollNumber) ? " · just below a boundary" : ""}`} />
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
                <span style={{ background: "var(--rust)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, marginRight: 6, cursor: "ns-resize" }}>
                  {g.letter}: {Math.round((cutoffs[g.letter] ?? 0) * 10) / 10}%
                </span>
                <div style={{ flex: 1, borderTop: "2px dashed var(--rust)" }} />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th>Grade</th><th>Boundary</th><th>Lowest who made it</th><th>Highest below it</th><th>Gap at the line</th></tr></thead>
          <tbody>
            {checks.map((c) => {
              const gap = c.lowestIn && c.highestOut ? r2(c.lowestIn.totalPct - c.highestOut.totalPct) : null;
              return (
                <tr key={c.letter} style={{ background: c.near.length ? "#FFF1F0" : undefined }}>
                  <td><b>{c.letter}</b></td>
                  <td>{r1(c.cut)}%</td>
                  <td>{c.lowestIn ? <>{c.lowestIn.rollNumber} · {c.lowestIn.totalPct}% <span className="small-note">(+{r2(c.lowestIn.totalPct - c.cut)})</span></> : "—"}</td>
                  <td style={{ color: c.near.length ? "#c93c3c" : undefined, fontWeight: c.near.length ? 600 : undefined }}>{c.highestOut ? <>{c.highestOut.rollNumber} · {c.highestOut.totalPct}% <span className="small-note">(−{r2(c.cut - c.highestOut.totalPct)})</span></> : "—"}</td>
                  <td>{gap !== null ? `${gap} marks between them` : "—"}{gap !== null && gap < 1 ? <span className="small-note"> — tight: move the line into a wider gap?</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={save} disabled={loading} className="btn btn-brass" style={{ marginTop: 12 }}>{loading ? "Saving…" : "Save Boundaries"}</button>
    </div>
  );
}
