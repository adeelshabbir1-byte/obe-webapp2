"use client";

import { useState } from "react";

type Req = { id: string; courseCode: string; courseTitle: string; requestedBy: string; reason: string; termLabel: string; date: string };

export default function TemplateChangeReview({ initial }: { initial: Req[] }) {
  const [reqs, setReqs] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});

  async function decide(id: string, status: "approved" | "rejected") {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/omc/template-changes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, comment: comments[id] || "" }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Something went wrong."); setBusy(false); return; }
      setReqs((p) => p.filter((x) => x.id !== id));
    } catch (e: any) { setError("Unexpected error: " + e.message); }
    setBusy(false);
  }

  return (
    <div className="card">
      {error && <div className="err">{error}</div>}
      {reqs.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No change requests are waiting.</p>}
      {reqs.map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
          <div style={{ fontSize: 13 }}><b>{r.courseCode} — {r.courseTitle}</b> <span style={{ color: "var(--slate)" }}>· {r.requestedBy} · {r.termLabel} · {r.date}</span></div>
          <div style={{ fontSize: 12.5, margin: "4px 0 6px" }}><b>Why:</b> {r.reason}</div>
          <textarea rows={2} placeholder="Comment for the Subject Expert (optional)…" value={comments[r.id] || ""} onChange={(e) => setComments((p) => ({ ...p, [r.id]: e.target.value }))} style={{ width: 300, padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, display: "block", marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-brass" disabled={busy} onClick={() => decide(r.id, "approved")}>Reopen for changes</button>
            <button className="btn" disabled={busy} onClick={() => decide(r.id, "rejected")}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
