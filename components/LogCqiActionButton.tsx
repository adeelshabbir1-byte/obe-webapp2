"use client";

import { useState } from "react";

export default function LogCqiActionButton({ courseId, batchId, sourceType, sourceReference, defaultFinding, metricBefore }: {
  courseId?: string; batchId?: string; sourceType: "CLO" | "PLO" | "PEO" | "GENERAL";
  sourceReference: string; defaultFinding: string; metricBefore?: number;
}) {
  const [open, setOpen] = useState(false);
  const [finding, setFinding] = useState(defaultFinding);
  const [actionTaken, setActionTaken] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/chairman/cqi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, batchId, sourceType, sourceReference, finding, actionTaken, metricBefore }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: "none", border: "1px solid var(--rust)", color: "var(--rust)", padding: "2px 8px", fontSize: 10.5, cursor: "pointer", borderRadius: 6 }}>
        Log CQI Action
      </button>
    );
  }

  if (ok) {
    return <span style={{ fontSize: 10.5, color: "var(--sage)" }}>✓ Logged</span>;
  }

  return (
    <div style={{ background: "#fff", border: "1px solid var(--rust)", padding: 10, marginTop: 6, maxWidth: 360, position: "relative", zIndex: 5 }}>
      {error && <div className="err" style={{ fontSize: 10.5 }}>{error}</div>}
      <label style={{ fontSize: 10, color: "var(--slate)", display: "block", marginBottom: 3 }}>Finding</label>
      <textarea value={finding} onChange={(e) => setFinding(e.target.value)} rows={2} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 11, marginBottom: 6 }} />
      <label style={{ fontSize: 10, color: "var(--slate)", display: "block", marginBottom: 3 }}>Planned Action (optional, can add later)</label>
      <textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} rows={2} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 11, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={submit} disabled={loading} className="btn btn-brass" style={{ padding: "3px 10px", fontSize: 11 }}>{loading ? "Saving…" : "Save"}</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "1px solid var(--line)", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
