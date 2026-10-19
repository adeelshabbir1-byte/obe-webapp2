"use client";

import { useState } from "react";

/** Calls the alumni API and shows the link (or message) it returns, ready to copy and send. */
export default function AlumniLinkButton({ body, label }: { body: Record<string, unknown>; label: string }) {
  const [out, setOut] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await fetch("/api/alumni-voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setOut(!r.ok ? d.error || "Could not do it." : d.message || (d.link ? `${window.location.origin}${d.link}` : "Done."));
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={go}>{busy ? "…" : label}</button>
      {out && <input readOnly value={out} onFocus={(e) => e.target.select()} style={{ minWidth: 320, fontSize: 12 }} />}
    </span>
  );
}
