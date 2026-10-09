"use client";

import { useState } from "react";
import type { Recipient } from "../lib/requests";

const input = { padding: "5px 7px", border: "1px solid var(--line)" } as const;

export default function AskForAction({ leadId, recipients, subject, area, href, message }: { leadId: string; recipients: Recipient[]; subject: string; area: string; href: string; message: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(recipients[0]?.id || "");
  const [body, setBody] = useState(message);
  const [due, setDue] = useState("");
  const [msg, setMsg] = useState(""); const [sent, setSent] = useState(false);
  async function send() {
    setMsg("");
    const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, toId: to, subject, area, href, body, dueDate: due || null }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setSent(true); setOpen(false); } else setMsg(d.error || "Something went wrong");
  }
  if (sent) return <span style={{ fontSize: 12, color: "var(--sage)" }}>Request sent</span>;
  return (
    <>
      <button className="btn" style={{ fontSize: 12 }} onClick={() => setOpen(!open)}>Ask</button>
      {open && (
        <div style={{ gridColumn: "1 / -1", background: "#F4F1EA", padding: 10, margin: "6px 0", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 6 }}>
            <label style={{ fontSize: 12 }}>Send to<br /><select style={input} value={to} onChange={(e) => setTo(e.target.value)}>{recipients.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.roleLabel})</option>)}</select></label>
            <label style={{ fontSize: 12 }}>Needed by (optional)<br /><input style={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          </div>
          <textarea style={{ ...input, width: "100%", minHeight: 70 }} value={body} onChange={(e) => setBody(e.target.value)} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            <button className="btn btn-brass" onClick={send}>Send request</button>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <span style={{ fontSize: 12.5, color: "#b3261e" }}>{msg}</span>
          </div>
        </div>
      )}
    </>
  );
}
