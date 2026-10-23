"use client";
import { useState } from "react";

// The fault form behind the QR label on a machine.
export default function AssetFaultForm({ assetId, signedIn }: { assetId: string; signedIn: boolean }) {
  const [text, setText] = useState(""), [name, setName] = useState("");
  const [state, setState] = useState<{ ok: boolean; t: string } | null>(null), [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await fetch("/api/asset-fault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId, description: text, name }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    setState(r.ok ? { ok: true, t: "Thank you — the lab engineer has been told." } : { ok: false, t: d.error || "Could not send." });
    if (r.ok) setText("");
  }
  if (state?.ok) return <p style={{ fontSize: 16, fontWeight: 700, color: "#1E6B3A" }}>{state.t}</p>;
  return (
    <form onSubmit={send} style={{ display: "grid", gap: 10 }}>
      <label style={{ fontSize: 14, fontWeight: 600 }}>What is wrong?
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} required minLength={5} placeholder="For example: does not start, no display, mouse missing, very slow" style={{ display: "block", width: "100%", marginTop: 4, padding: 10, fontSize: 15, border: "1px solid #bbb", borderRadius: 8, fontFamily: "inherit" }} />
      </label>
      {!signedIn && <label style={{ fontSize: 14, fontWeight: 600 }}>Your name (optional)<input value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: 10, fontSize: 15, border: "1px solid #bbb", borderRadius: 8 }} /></label>}
      {state && <p style={{ color: "#B3261E", margin: 0 }}>{state.t}</p>}
      <button type="submit" disabled={busy || text.trim().length < 5} style={{ padding: "12px 16px", fontSize: 16, fontWeight: 700, background: "#7A1F2B", color: "#fff", border: 0, borderRadius: 8 }}>{busy ? "Sending…" : "Report the fault"}</button>
    </form>
  );
}
