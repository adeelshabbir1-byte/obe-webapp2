"use client";
import { useState } from "react";

type R = { score: number; checks: { area: string; score: number; ok: boolean; findings: string[]; fixes: string[] }[]; summary: string; model?: string; cached?: boolean; costUsd?: number };

/** "AI review" of the Subject Expert's plan: one click; the system builds the request from the plan itself. */
export default function AiPlanReview({ courseId }: { courseId: string }) {
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const x = await fetch("/api/ai-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }) });
    const j = await x.json().catch(() => ({}));
    setBusy(false);
    if (!x.ok) { setErr(j.error || `HTTP ${x.status}`); return; }
    setR(j);
  }
  return (
    <div className="card no-print" data-ai-review>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>AI review of this plan</b>
        <span className="small-note">CLO wording and Bloom · topic → CLO · sequence and prerequisites · assessment coverage · importance and time · council outline</span>
        <button className="btn btn-sm" disabled={busy} onClick={go} data-ai-review-run>{busy ? "Reviewing…" : r ? "Review again" : "AI review"}</button>
      </div>
      {err && <div className="err" style={{ marginTop: 6 }}>{err}</div>}
      {r && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <div><b style={{ fontSize: 16 }}>{r.score}/100</b> — {r.summary}</div>
          <table style={{ marginTop: 6 }}><thead><tr><th>Area</th><th>Score</th><th>Findings</th><th>Fixes</th></tr></thead>
            <tbody>{r.checks.map((c) => <tr key={c.area}><td>{c.ok ? "✓" : "✗"} {c.area}</td><td>{c.score}/10</td><td><ul style={{ margin: 0, paddingLeft: 16 }}>{c.findings.map((f, i) => <li key={i}>{f}</li>)}</ul></td><td><ul style={{ margin: 0, paddingLeft: 16 }}>{c.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul></td></tr>)}</tbody></table>
          <p className="small-note">Model {r.model}{r.cached ? " · from the cache (this version was reviewed before; no new cost)" : typeof r.costUsd === "number" ? ` · cost US$ ${r.costUsd.toFixed(4)}` : ""}. Advisory only.</p>
        </div>
      )}
    </div>
  );
}
