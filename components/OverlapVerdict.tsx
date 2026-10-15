"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Progression / Duplication buttons for one repeated topic. */
export default function OverlapVerdict({ coordinatorId, codeA, codeB, topicA, topicB, verdict, suggested, canEdit }: {
  coordinatorId: string; codeA: string; codeB: string; topicA: string; topicB: string; verdict: string | null; suggested: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function set(v: string | null) {
    setBusy(true); setErr("");
    const res = await fetch("/api/topic-overlaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinatorId, codeA, codeB, topicA, topicB, verdict: v }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Could not save."); return; }
    router.refresh();
  }
  const label = (v: string) => (v === "PROGRESSION" ? "Intentional progression" : "Accidental duplication");
  if (!canEdit) return verdict ? <span className={`badge ${verdict === "PROGRESSION" ? "badge-ok" : "badge-no"}`}>{label(verdict)}</span> : <span className="small-note">Suggested: {label(suggested).toLowerCase()}</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {["PROGRESSION", "DUPLICATION"].map((v) => (
        <button key={v} type="button" disabled={busy} onClick={() => set(verdict === v ? null : v)}
          className={`act ${verdict === v ? (v === "PROGRESSION" ? "act-primary" : "act-danger") : "act-neutral"}`}
          aria-pressed={verdict === v} title={verdict === v ? "Click again to clear" : undefined}>
          {label(v)}{!verdict && suggested === v ? " (suggested)" : ""}
        </button>
      ))}
      {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
    </span>
  );
}
