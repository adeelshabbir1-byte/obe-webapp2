"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Next step →" (and the named finishing buttons like "Positions are final →"): marks this set-up step done for the
// batch and takes the Program Lead to the next step's page.
export default function SetupStepButton({ batchId, step, label, href, primary = true, reopen = false }: { batchId: string; step: number; label: string; href?: string | null; primary?: boolean; reopen?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const r = await fetch("/api/coordinator/batch-flow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, step, action: reopen ? "reopen" : "done" }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Could not save."); return; }
    if (reopen) { router.refresh(); return; }
    const to = href || d.next;
    if (to) router.push(to); else router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button type="button" className={primary ? "btn btn-sm" : "btn btn-secondary btn-sm"} disabled={busy} onClick={go}>{busy ? "…" : label}</button>
      {err && <span className="err" style={{ margin: 0 }}>{err}</span>}
    </span>
  );
}
