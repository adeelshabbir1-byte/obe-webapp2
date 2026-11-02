"use client";
import { useState } from "react";

export default function PartnerNoteForm({ token, step }: { token: string; step: string }) {
  const [t, setT] = useState(""); const [m, setM] = useState("");
  const send = async (agree: boolean) => {
    const r = await fetch("/api/collab-partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, step, text: t, agree }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setM(d.error || "Could not send.");
    setT(""); setM(agree ? "Recorded: you agreed this step." : "Comment sent."); location.reload();
  };
  return (
    <div style={{ marginTop: 8 }}>
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={2} placeholder="Comment for the programme team (optional when agreeing)" style={{ width: "100%" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => send(false)} disabled={!t.trim()}>Send comment</button><button type="button" className="btn btn-sm" onClick={() => send(true)}>We agree this step</button><span className="small-note">{m}</span></div>
    </div>
  );
}
