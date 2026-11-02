"use client";
import { useState } from "react";

const post = (b: unknown) => fetch("/api/hec-view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
export function HecLinkForm() {
  const [f, setF] = useState({ label: "", days: "30" }); const [url, setUrl] = useState(""); const [m, setM] = useState("");
  return <div className="card" style={{ fontSize: 13 }}><b>New link</b> <input placeholder="For (e.g. HEC QAA, Mr. …)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /> valid for <input type="number" min={1} max={365} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} style={{ width: 70 }} /> days <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "link", label: f.label, days: Number(f.days) }); if (!r.ok) setM(r.d.error || "Failed"); else { setUrl(r.d.url); setM("Copy it now — it is shown only once."); } }}>Make link</button>
    {url && <p style={{ wordBreak: "break-all", background: "#F7F6F1", padding: 6, borderRadius: 6 }}>{url}</p>}<span className="small-note">{m}</span></div>;
}
export function HecRevoke({ id }: { id: string }) {
  return <button type="button" className="btn-link" onClick={async () => { await post({ action: "revoke", id }); location.reload(); }}>Revoke</button>;
}
export function HecShare({ on }: { on: boolean }) {
  const [v, setV] = useState(on); const [m, setM] = useState("");
  return <label style={{ fontSize: 13 }}><input type="checkbox" checked={v} onChange={async (e) => { const r = await post({ action: "share", on: e.target.checked }); if (r.ok) { setV(!v); setM("Saved ✓"); } else setM(r.d.error || "Failed"); }} /> Share our institute&apos;s totals with HEC (numbers only — no student or teacher is named) <span className="small-note">{m}</span></label>;
}
