"use client";

import { useState } from "react";

/** A written SAR answer: edited in place and saved for the business school. */
export default function NarrativeEditor({ scopeKey, code, initial, canEdit }: { scopeKey: string; code: string; initial: string; canEdit: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "error">("");
  const [err, setErr] = useState("");
  if (!canEdit) return text ? <p style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: 0 }}>{text}</p> : <p className="small-note" style={{ margin: 0 }}>Not written yet.</p>;
  async function save() {
    setState("saving"); setErr("");
    const res = await fetch("/api/accreditation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveNarrative", scopeKey, code, text }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setState("error"); setErr(data.error || "Could not save."); return; }
    setSaved(text); setState("");
  }
  return (
    <div>
      <textarea rows={Math.min(14, Math.max(4, text.split("\n").length + 1))} value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} aria-label={`Answer to ${code}`} placeholder="Write the answer here…" />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
        <button type="button" className="btn btn-brass btn-sm" disabled={state === "saving" || text === saved} onClick={save}>{state === "saving" ? "Saving…" : text === saved && saved ? "Saved" : "Save answer"}</button>
        <span className="small-note">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
        {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
      </div>
    </div>
  );
}
