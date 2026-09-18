"use client";

import { useState, useEffect, Fragment } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
                            <ResponsiveContainer width="100%" height={220}>
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" dataKey="prereqPct" name={p.prereqCode} unit="%" domain={[0, 100]} label={{ value: `${p.prereqCode} %`, position: "insideBottom", offset: -5, fontSize: 10 }} tick={{ fontSize: 10 }} />
                                <YAxis type="number" dataKey="dependentPct" name={p.dependentCode} unit="%" domain={[0, 100]} label={{ value: `${p.dependentCode} %`, angle: -90, position: "insideLeft", fontSize: 10 }} tick={{ fontSize: 10 }} />
                                <ZAxis range={[40, 40]} />
                                <Tooltip formatter={(v: number) => `${v}%`} />
                                <Scatter data={p.scatterPoints} fill="var(--brass-dark)" />
                              </ScatterChart>
                            </ResponsiveContainer>
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
