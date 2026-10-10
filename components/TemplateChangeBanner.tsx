"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type State = { status: string; request: { id: string; status: string; reason: string; omcComment: string | null } | null };

/** Shown on every Subject Expert course tab once the template is approved (locked) or reopened for changes. */
export default function TemplateChangeBanner({ courseId }: { courseId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try { const r = await fetch(`/api/subjectexpert/courses/${courseId}/change-request`); if (r.ok) setState(await r.json()); } catch { /* banner is optional */ }
  }
  useEffect(() => { load(); }, [courseId]);

  async function send() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/subjectexpert/courses/${courseId}/change-request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Something went wrong."); setBusy(false); return; }
      setOpen(false); setReason(""); await load();
    } catch (e: any) { setError("Unexpected error: " + e.message); }
    setBusy(false);
  }

  if (!state) return null;
  const req = state.request;
  const history = <Link href={`/subjectexpert/courses/${courseId}/change-history`} style={{ fontSize: 12, color: "var(--brass-dark)", marginLeft: 10 }}>Change history</Link>;

  if (state.status === "reopened") {
    return (
      <div className="card" style={{ marginTop: 12, borderColor: "var(--sage)" }}>
        <b style={{ fontSize: 13 }}>Reopened for changes.</b>
        <span style={{ fontSize: 12.5 }}> The OMC agreed to your change request{req?.omcComment ? ` ("${req.omcComment}")` : ""}. Make your changes, then press Submit on the Assessments &amp; Submit tab — what you changed is recorded automatically.</span>
        {history}
      </div>
    );
  }
  if (state.status !== "approved") return null;

  return (
    <div className="card" style={{ marginTop: 12, borderColor: "var(--brass)" }}>
      <b style={{ fontSize: 13 }}>🔒 Approved by the OMC — locked.</b>
      <span style={{ fontSize: 12.5 }}> To change anything on these tabs, ask the OMC to reopen it.</span>
      {history}
      {req?.status === "pending" && <p style={{ fontSize: 12.5, marginTop: 8 }}>Your change request is waiting for the OMC: <i>"{req.reason}"</i></p>}
      {req?.status === "rejected" && <p style={{ fontSize: 12.5, marginTop: 8, color: "var(--rust)" }}>Your last request was declined{req.omcComment ? `: "${req.omcComment}"` : "."}</p>}
      {req?.status !== "pending" && !open && <div style={{ marginTop: 8 }}><button className="btn btn-brass" onClick={() => setOpen(true)}>Request Change</button></div>}
      {open && (
        <div style={{ marginTop: 8 }}>
          {error && <div className="err">{error}</div>}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="What do you want to change, and why? (e.g. last semester's results showed CLO-3 was too weakly tested…)" style={{ width: "100%", maxWidth: 560, padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="btn btn-brass" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send to OMC"}</button>
            <button className="btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
