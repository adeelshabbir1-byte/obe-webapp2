"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES: [string, string][] = [["NEW", "New"], ["UNDER_REVIEW", "Under review"], ["PLANNED", "Planned"], ["DONE", "Done"], ["DECLINED", "Not planned"]];

/** The Super User's controls for one feedback item: status, reply, and recognition. */
export default function FeedbackAdminRow({ id, status, adminReply, recognized }: { id: string; status: string; adminReply: string | null; recognized: boolean }) {
  const router = useRouter();
  const [st, setSt] = useState(status);
  const [reply, setReply] = useState(adminReply || "");
  const [rec, setRec] = useState(recognized);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: st, adminReply: reply, ...extra }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || "Could not save."); return; }
    setMsg("Saved — the sender has been told."); router.refresh();
  }
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
      <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Answer to the sender" maxLength={3000} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status">{STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button type="button" className="btn btn-brass btn-xs" disabled={busy} onClick={() => save()}>Save</button>
        {!rec
          ? <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => { setRec(true); save({ recognize: true }); }} title="Gives the sender the System Improver badge">🌟 Recognise</button>
          : <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => { setRec(false); save({ recognize: false }); }}>Undo recognition</button>}
      </div>
      {msg && <span className="small-note">{msg}</span>}
    </div>
  );
}
