"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BackfillPloButton({ batchId, label }: { batchId: string; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/plo-progress/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setMsg(`${d.courses} course result(s) added.`); router.refresh(); } else setMsg(d.error || "Could not fill.");
  }
  return <span><button className="btn btn-secondary btn-sm" disabled={busy} onClick={go}>{busy ? "Calculating…" : label}</button> {msg && <span style={{ fontSize: 12 }}>{msg}</span>}</span>;
}
