"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** A small "score %" box with Save, for recording one student's micro-assessment. */
export default function InlineScore({ enrollmentId, initial, passPct }: { enrollmentId: string; initial: number | null; passPct: number }) {
  const router = useRouter();
  const [v, setV] = useState(initial === null ? "" : String(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/remediation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", enrollmentId, scorePct: v === "" ? NaN : Number(v) }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data.error || "Could not save." }); return; }
    setMsg({ ok: data.cleared, text: data.cleared ? (data.transcriptUpdated ? "Cleared — attainment updated" : "Cleared") : `Below ${passPct}% — not cleared` });
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="number" min={0} max={100} step="0.5" value={v} onChange={(e) => setV(e.target.value)} aria-label="Micro-assessment score %" style={{ width: 70 }} />%
      <button type="button" className="act act-primary" disabled={busy || v === ""} onClick={save}>{busy ? "…" : "Save"}</button>
      {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
    </span>
  );
}
