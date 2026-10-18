"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** One typed-in answer on the council eligibility check (yes/no, a number or a choice). */
export default function EligibilityInput({ body, program, k, kind, options, value }: { body: string; program: string; k: string; kind: "yesno" | "number" | "select"; options?: string[]; value: string }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save(next: string) {
    setBusy(true); setErr("");
    const res = await fetch("/api/accreditation/eligibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, program, key: k, value: next }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "Could not save."); return; }
    router.refresh();
  }
  const opts = kind === "yesno" ? ["Yes", "No"] : options || [];
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {kind === "number" ? (
        <>
          <input type="number" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 90 }} aria-label="Value" />
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || v === value} onClick={() => save(v)}>{busy ? "…" : "Save"}</button>
          {value && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setV(""); save(""); }} title="Go back to the system's figure">Clear</button>}
        </>
      ) : (
        <select value={v} disabled={busy} onChange={(e) => { setV(e.target.value); save(e.target.value); }} aria-label="Answer">
          <option value="">— choose —</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
    </span>
  );
}
