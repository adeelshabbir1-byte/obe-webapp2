"use client";

import { useState } from "react";

/** Posts and shows the returned message in a copyable box (for one-time secrets). */
export default function KeyButton({ url, body, label }: { url: string; body: Record<string, unknown>; label: string }) {
  const [out, setOut] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false); setOut(r.ok ? d.message || "Done." : d.error || "Could not do it.");
  }
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={go}>{busy ? "…" : label}</button>{out && <input readOnly value={out} onFocus={(e) => e.target.select()} style={{ minWidth: 420, fontSize: 12 }} />}</span>;
}
