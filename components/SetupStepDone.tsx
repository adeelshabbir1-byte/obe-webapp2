"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "… are final →": ticks this set-up step and goes to the next one.
export default function SetupStepDone({ batchId, step, label, nextUrl, done }: { batchId: string; step: string; label: string; nextUrl: string; done: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const r = await fetch("/api/coordinator/batch-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stepDone", batchId, step }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Could not save."); return; }
    router.push(nextUrl);
  }
  return <>{err && <span className="err" style={{ margin: 0 }}>{err}</span>}<button type="button" className="btn btn-sm" style={{ background: "#2E7D32", borderColor: "#2E7D32" }} disabled={busy} onClick={go}>{busy ? "Saving…" : `${done ? "✓ " : ""}${label} →`}</button></>;
}
