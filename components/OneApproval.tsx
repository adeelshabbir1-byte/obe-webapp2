"use client";
import { useState } from "react";
export default function OneApproval({ kind, id, actions }: { kind: string; id: string; actions: string[] }) {
  const [why, setWhy] = useState(""); const [ret, setRet] = useState(false); const [m, setM] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const go = async (decision: "approve" | "return") => {
    setBusy(true);
    const r = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decide", kind, id, decision, reason: why }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    setM(r.ok ? { ok: true, text: decision === "approve" ? "Approved ✓" : "Returned with your reason ✓" } : { ok: false, text: d.error || "Could not save." });
  };
  if (m?.ok) return <div className="ok" role="status" style={{ fontSize: 16 }}>{m.text} <a href="/approvals">Next item →</a></div>;
  return <div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {actions.includes("approve") && <button type="button" className="btn" style={{ minHeight: 48, minWidth: 140, fontSize: 16 }} disabled={busy} onClick={() => go("approve")} data-one-approve>Approve</button>}
      {actions.includes("return") && <button type="button" className="btn btn-secondary" style={{ minHeight: 48, minWidth: 140, fontSize: 16 }} disabled={busy} onClick={() => setRet(true)}>Return…</button>}
    </div>
    {ret && <div style={{ marginTop: 8 }}><textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why are you returning it? (the sender sees this)" style={{ width: "100%" }} /><button type="button" className="btn btn-danger" disabled={busy || !why.trim()} onClick={() => go("return")}>Return</button></div>}
    {m && !m.ok && <div className="err" role="status" style={{ marginTop: 6 }}>{m.text}</div>}
  </div>;
}
