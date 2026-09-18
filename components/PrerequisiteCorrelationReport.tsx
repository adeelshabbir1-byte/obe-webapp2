"use client";

import { useState, useEffect, Fragment } from "react";

type Pair = {
  prereqCode: string; prereqTitle: string; dependentCode: string; dependentTitle: string;
  studentCount: number; correlation: number | null;
  passFailCrosstab: { passedBoth: number; passedPrereqFailedDependent: number; failedPrereqPassedDependent: number; failedBoth: number };
  scatterPoints: { prereqPct: number; dependentPct: number }[];
  plo: { label: string; correlation: number | null; pointCount: number }[];
};

function strengthLabel(r: number | null): { text: string; color: string } {
  if (r === null) return { text: "Not enough data", color: "var(--slate)" };
  const abs = Math.abs(r);
  if (abs >= 0.7) return { text: r > 0 ? "Strong positive" : "Strong negative", color: r > 0 ? "var(--sage)" : "var(--rust)" };
  if (abs >= 0.4) return { text: r > 0 ? "Moderate positive" : "Moderate negative", color: r > 0 ? "var(--sage)" : "var(--rust)" };
  if (abs >= 0.2) return { text: r > 0 ? "Weak positive" : "Weak negative", color: "var(--brass-dark)" };
  return { text: "Little to no correlation", color: "var(--slate)" };
}

function ScatterPlot({ points, xLabel, yLabel }: { points: { prereqPct: number; dependentPct: number }[]; xLabel: string; yLabel: string }) {
  const size = 220, margin = 30, plotSize = size - margin - 10;
  const toX = (v: number) => margin + (v / 100) * plotSize;
  const toY = (v: number) => size - margin - (v / 100) * plotSize;
  const ticks = [0, 25, 50, 75, 100];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 280 }}>
      {/* axes */}
      <line x1={margin} y1={size - margin} x2={size - 10} y2={size - margin} stroke="var(--line)" />
      <line x1={margin} y1={10} x2={margin} y2={size - margin} stroke="var(--line)" />
      {ticks.map((t) => (
        <Fragment key={t}>
          <text x={toX(t)} y={size - margin + 12} fontSize={7} textAnchor="middle" fill="var(--slate)">{t}</text>
          <text x={margin - 4} y={toY(t) + 3} fontSize={7} textAnchor="end" fill="var(--slate)">{t}</text>
        </Fragment>
      ))}
      <text x={(margin + size - 10) / 2} y={size - 2} fontSize={8} textAnchor="middle" fill="var(--slate)">{xLabel} %</text>
      <text x={8} y={(10 + size - margin) / 2} fontSize={8} textAnchor="middle" fill="var(--slate)" transform={`rotate(-90, 8, ${(10 + size - margin) / 2})`}>{yLabel} %</text>
      {points.map((p, i) => (
        <circle key={i} cx={toX(p.prereqPct)} cy={toY(p.dependentPct)} r={3} fill="var(--brass-dark)" opacity={0.65}>
          <title>{`${xLabel}: ${p.prereqPct}%, ${yLabel}: ${p.dependentPct}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default function PrerequisiteCorrelationReport() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/omc/prerequisite-correlation")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setPairs(data.pairs); setLoaded(true);
      })
      .catch((err) => setError("Failed to load: " + err.message));
  }, []);

  if (error) return <div className="err">{error}</div>;
  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Computing correlations…</p></div>;
  if (pairs.length === 0) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No prerequisite pairs with enough graded students yet.</p></div>;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
          For every prerequisite relationship on record, this correlates each student's final percentage in the
          prerequisite against their final percentage in the course that requires it — combining every batch that
          repeats the same course pair into one larger sample. A pair needs at least 3 students who took and were
          graded in both to show a correlation at all. Pass/fail below counts grade C or better as a pass.
        </p>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ fontSize: 11, textAlign: "left" }}>
              <th style={{ padding: 6 }}>Prerequisite</th>
              <th style={{ padding: 6 }}>Then</th>
              <th style={{ padding: 6 }}>Students</th>
              <th style={{ padding: 6 }}>Correlation</th>
              <th style={{ padding: 6 }}></th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const key = `${p.prereqCode}|${p.dependentCode}`;
              const strength = strengthLabel(p.correlation);
              const isOpen = expandedKey === key;
              return (
                <Fragment key={key}>
                  <tr style={{ fontSize: 12.5, borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: 6 }}><b>{p.prereqCode}</b> — {p.prereqTitle}</td>
                    <td style={{ padding: 6 }}><b>{p.dependentCode}</b> — {p.dependentTitle}</td>
                    <td style={{ padding: 6 }}>{p.studentCount}</td>
                    <td style={{ padding: 6 }}>
                      <span style={{ color: strength.color, fontWeight: 600 }}>{p.correlation ?? "—"}</span>
                      <div style={{ fontSize: 10.5, color: strength.color }}>{strength.text}</div>
                    </td>
                    <td style={{ padding: 6 }}>
                      <button onClick={() => setExpandedKey(isOpen ? null : key)} style={{ fontSize: 11, padding: "3px 8px", border: "1px solid var(--line)", background: "#fff" }}>
                        {isOpen ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={key + "-detail"}>
                      <td colSpan={5} style={{ padding: 12, background: "#FAFAF8" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                          <div>
                            <h4 style={{ fontSize: 12, marginBottom: 8 }}>Grade scatter</h4>
                            <ScatterPlot points={p.scatterPoints} xLabel={p.prereqCode} yLabel={p.dependentCode} />
                          </div>
                          <div>
                            <h4 style={{ fontSize: 12, marginBottom: 8 }}>Pass / fail crosstab</h4>
                            <table style={{ fontSize: 11.5, borderCollapse: "collapse" }}>
                              <tbody>
                                <tr><td style={{ padding: 4 }}>Passed both</td><td style={{ padding: 4, fontWeight: 600, color: "var(--sage)" }}>{p.passFailCrosstab.passedBoth}</td></tr>
                                <tr><td style={{ padding: 4 }}>Passed prereq, failed dependent</td><td style={{ padding: 4, fontWeight: 600, color: "var(--brass-dark)" }}>{p.passFailCrosstab.passedPrereqFailedDependent}</td></tr>
                                <tr><td style={{ padding: 4 }}>Failed prereq, passed dependent</td><td style={{ padding: 4, fontWeight: 600, color: "var(--brass-dark)" }}>{p.passFailCrosstab.failedPrereqPassedDependent}</td></tr>
                                <tr><td style={{ padding: 4 }}>Failed both</td><td style={{ padding: 4, fontWeight: 600, color: "var(--rust)" }}>{p.passFailCrosstab.failedBoth}</td></tr>
                              </tbody>
                            </table>
                            {p.plo.length > 0 && (
                              <>
                                <h4 style={{ fontSize: 12, marginTop: 14, marginBottom: 6 }}>Shared PLO correlations</h4>
                                {p.plo.map((plo) => {
                                  const s = strengthLabel(plo.correlation);
                                  return (
                                    <div key={plo.label} style={{ fontSize: 11.5, padding: "2px 0" }}>
                                      {plo.label}: <span style={{ color: s.color, fontWeight: 600 }}>{plo.correlation ?? "—"}</span> <span style={{ color: "var(--slate)" }}>({plo.pointCount} students)</span>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
