"use client";

import { useState, useEffect } from "react";

type PloOverall = { number: number; title: string; avgPct: number; coursesContributing: number; lagging: boolean };
type RoadmapItem = { courseId: string; code: string; title: string; semesterNumber: number | null; touchedLaggingPlos: number[] };
type HeatmapRow = { termLabel: string; termYear: number; plos: Record<number, number> };

function cellColor(pct: number, threshold: number) {
  if (pct < threshold) return "#FFE8ED"; // under-attained — red
  if (pct < threshold + 10) return "#FFF3DC"; // borderline — amber
  return "#E3F8EF"; // solid — green
}

export default function ObeAnalytics() {
  const [data, setData] = useState<{ ploPassingThreshold: number; overallByPlo: PloOverall[]; roadmap: RoadmapItem[]; heatmap: HeatmapRow[]; allPloNumbers: number[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/student/obe-analytics").then((r) => r.json()).then((json) => {
      if (json.error) { setError(json.error); return; }
      setData(json);
    }).catch((err) => setError("Unexpected error: " + err.message));
  }, []);

  if (error) return <div className="err">{error}</div>;
  if (!data) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading…</p>;

  const laggingPlos = data.overallByPlo.filter((p) => p.lagging);

  return (
    <div>
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Your PLO Attainment</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Averaged across every completed course that touches each Program Learning Outcome. Below {data.ploPassingThreshold}% is flagged as needing attention.
        </p>
        {data.overallByPlo.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No attainment data yet — this fills in as you complete courses.</p>}
        {data.overallByPlo.map((p) => (
          <div key={p.number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 12.5 }}>PLO-{p.number}: {p.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({p.coursesContributing} course{p.coursesContributing === 1 ? "" : "s"})</span></span>
            <span className={p.lagging ? "badge badge-no" : "badge badge-ok"}>{p.avgPct.toFixed(0)}%</span>
          </div>
        ))}
      </div>

      {laggingPlos.length > 0 && (
        <div className="card" style={{ background: "#FFF3DC" }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>PLOs Needing Attention</h3>
          <p style={{ fontSize: 11.5, color: "#8A4B00" }}>
            You're currently below target on: {laggingPlos.map((p) => `PLO-${p.number}`).join(", ")}.
          </p>
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Improvement Roadmap</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Future courses in your own curriculum that would specifically help your currently-lagging PLOs.
        </p>
        {data.roadmap.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>{laggingPlos.length === 0 ? "You're not currently lagging on anything." : "No upcoming course in your plan directly targets your lagging PLOs — talk to your Advisor about options."}</p>}
        {data.roadmap.map((r) => (
          <div key={r.courseId} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 12.5 }}>{r.code} — {r.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>(Semester {r.semesterNumber})</span></span>
            <div style={{ fontSize: 11, color: "var(--sage)", marginTop: 2 }}>Helps: {r.touchedLaggingPlos.map((n) => `PLO-${n}`).join(", ")}</div>
          </div>
        ))}
      </div>

      {data.heatmap.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Risk Heatmap — By Term</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th style={{ padding: "4px 8px", textAlign: "left" }}>Term</th>
                  {data.allPloNumbers.map((n) => <th key={n} style={{ padding: "4px 8px" }}>PLO-{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.heatmap.map((row) => (
                  <tr key={row.termLabel}>
                    <td style={{ padding: "4px 8px", fontWeight: 600 }}>{row.termLabel}</td>
                    {data.allPloNumbers.map((n) => (
                      <td key={n} style={{ padding: "4px 8px", textAlign: "center", background: row.plos[n] !== undefined ? cellColor(row.plos[n], data.ploPassingThreshold) : "#F3F6FD" }}>
                        {row.plos[n] !== undefined ? `${row.plos[n].toFixed(0)}%` : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
