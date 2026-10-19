"use client";

import { useState } from "react";

/** A faculty member's request to one alumnus: produces the personal link to send (WhatsApp / email). */
export default function AlumniRequestForm({ alumni }: { alumni: { id: string; label: string }[] }) {
  const [id, setId] = useState(""); const [message, setMessage] = useState(""); const [questions, setQuestions] = useState("Where do you work now, and in what role?\nWhich course of the program helped you most at work, and which skill was missing?");
  const [out, setOut] = useState(""); const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setOut("");
    const r = await fetch("/api/alumni-voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", alumniId: id, message, questions }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setOut(r.ok ? `${window.location.origin}${d.link}` : d.error || "Could not create the request.");
  }
  return (
    <div style={{ display: "grid", gap: 6, maxWidth: 720 }}>
      <select value={id} onChange={(e) => setId(e.target.value)}><option value="">— alumnus —</option>{alumni.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
      <textarea rows={2} placeholder="Your message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      <textarea rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} aria-label="Questions, one per line" />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-brass btn-sm" disabled={!id || busy} onClick={send}>{busy ? "…" : "Create request link"}</button>
        {out && <input readOnly value={out} onFocus={(e) => e.target.select()} style={{ minWidth: 360, fontSize: 12 }} />}
      </div>
      <span className="small-note">Questions one per line. Send the link by WhatsApp or email; when the alumnus answers, it counts towards your Alumni Connector badge.</span>
    </div>
  );
}
