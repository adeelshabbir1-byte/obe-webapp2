"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Approve / return a course result, or approve / reject a grade change. A note is required to send it back. */
export default function ResultDecision({ url, body, okLabel, noLabel, noAction, okAction }: { url: string; body: Record<string, unknown>; okLabel: string; noLabel: string; okAction: string; noAction: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(action: string, needNote: boolean) {
    const note = window.prompt(needNote ? "Note for the Instructor (required — say what needs fixing):" : "Optional note:", "");
    if (note === null) return;
    if (needNote && note.trim().length < 5) { setError("Please write a short note."); return; }
    setBusy(true); setError("");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, action, note }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Could not save."); return; }
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-brass" style={{ fontSize: 12, padding: "5px 12px" }} disabled={busy} onClick={() => go(okAction, false)}>{okLabel}</button>
      <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }} disabled={busy} onClick={() => go(noAction, true)}>{noLabel}</button>
      {error && <span style={{ color: "var(--rust)", fontSize: 12 }}>{error}</span>}
    </span>
  );
}
