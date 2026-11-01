"use client";

import { useState } from "react";

async function post(body: unknown) {
  return fetch("/api/term-archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
}
export function ArchiveTerm({ term, ready }: { term: string; ready: boolean }) {
  const [msg, setMsg] = useState("");
  return <span>{msg ? <span className="small-note">{msg}</span> : <button type="button" className="btn btn-sm" disabled={!ready} title={ready ? "" : "Some results are not approved yet"} onClick={async () => {
    if (!confirm(`Archive ${term}? Its courses become read-only; corrections then need an approved amendment.`)) return;
    const r = await post({ action: "archive", term });
    setMsg(r.error || `${r.archived} course(s) archived${r.notReady?.length ? ` · not ready: ${r.notReady.join(", ")}` : ""}`);
  }}>Archive this term</button>}</span>;
}
export function Decide({ id }: { id: string }) {
  const [done, setDone] = useState("");
  if (done) return <span className="small-note">{done}</span>;
  const go = async (approve: boolean) => { const r = await post({ action: "decide", id, approve }); setDone(r.error || (approve ? "Approved — open 48 h" : "Refused")); };
  return <span><button type="button" className="btn btn-sm" onClick={() => go(true)}>Approve</button> <button type="button" className="btn-link" onClick={() => go(false)}>Refuse</button></span>;
}
export function RequestAmendment({ courses }: { courses: { id: string; label: string }[] }) {
  const [id, setId] = useState(""); const [reason, setReason] = useState(""); const [msg, setMsg] = useState("");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13, alignItems: "center" }}>
      <select value={id} onChange={(e) => setId(e.target.value)}><option value="">Archived course…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What must change, and why" style={{ width: 280 }} />
      <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "amend", courseId: id, reason }); setMsg(r.error || "Requested ✓ — the HOD / Controller is told."); }}>Request an amendment</button>
      {msg && <span className="small-note">{msg}</span>}
    </div>
  );
}
