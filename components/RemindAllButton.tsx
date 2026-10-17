"use client";
import { useState } from "react";

// Sends one reminder per person per late/at-risk task (the API skips anyone already reminded in the last day).
export default function RemindAllButton({ targets }: { targets: { deadlineId: string; toId: string; item: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!targets.length) return null;
  async function go() {
    if (!confirm(`Send ${targets.length} reminder${targets.length > 1 ? "s" : ""} to everyone with late or at-risk tasks?`)) return;
    setBusy(true);
    let sent = 0, skipped = 0;
    for (const t of targets) {
      const r = await fetch("/api/semester-plan/remind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) }).catch(() => null);
      if (r?.ok) sent++; else skipped++;
    }
    setBusy(false);
    setMsg(`${sent} reminder${sent === 1 ? "" : "s"} sent${skipped ? `, ${skipped} skipped (already reminded today or not in your area)` : ""}.`);
  }
  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn btn-brass btn-sm" disabled={busy} onClick={go}>{busy ? "Sending…" : `Remind everyone who is late (${targets.length})`}</button>
      {msg && <span style={{ fontSize: 12, marginLeft: 8, color: "var(--sage)" }}>{msg}</span>}
    </div>
  );
}
