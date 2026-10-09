"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SnapshotButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, label }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false); setMsg(res.ok ? "Saved" : d.error || "Something went wrong");
    if (res.ok) { setLabel(""); router.refresh(); }
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. End of Fall 2026" style={{ padding: "6px 8px", border: "1px solid var(--line)", width: 220 }} />
      <button className="btn btn-brass" onClick={go} disabled={busy}>{busy ? "Saving…" : "Save today's scores"}</button>
      <span style={{ fontSize: 12, color: msg === "Saved" ? "var(--sage)" : "#b3261e" }}>{msg}</span>
    </span>
  );
}
