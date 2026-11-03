"use client";
import { useState } from "react";
export default function RolloverButton({ n }: { n: number }) {
  const [busy, setBusy] = useState(false); const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  return <div className="card" data-rollover><button type="button" className="btn" disabled={busy} onClick={async () => {
    if (!confirm(`Copy plans into ${n} course(s)?`)) return; setBusy(true);
    const r = await fetch("/api/term-rollover", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) setM({ ok: false, text: d.error || "Failed." }); else { setM({ ok: !d.failed?.length, text: `${d.done} course(s) filled.${d.failed?.length ? ` Not done: ${d.failed.join("; ")}` : ""}` }); setTimeout(() => location.reload(), 1500); }
  }}>{busy ? "Copying…" : `Copy plans into all ${n} course(s)`}</button>{m && <div className={m.ok ? "ok" : "err"} role="status" style={{ marginTop: 6 }}>{m.text}</div>}</div>;
}
