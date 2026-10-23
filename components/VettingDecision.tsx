"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { key: string; label: string; auto: boolean; ok: boolean | null; note?: string };

/** The vetter's checklist (four checks worked out by OBEHUB, clarity ticked by the vetter) with Approve / Return. */
export default function VettingDecision({ id, items, endpoint = "/api/paper-vetting", extra = {} }: { id: string; items: Item[]; endpoint?: string; extra?: Record<string, unknown> }) {
  const router = useRouter();
  const [clarity, setClarity] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function decide(approve: boolean) {
    if (clarity === null) { setMsg({ ok: false, t: "Tick whether the questions are clear." }); return; }
    if (!approve && !note.trim()) { setMsg({ ok: false, t: "Say what should be improved." }); return; }
    setBusy(true); setMsg(null);
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decide", id, approve, note, clarity, ...extra }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: approve ? "Approved." : "Returned to the teacher." }); router.refresh(); } else setMsg({ ok: false, t: d.error || "Could not save" });
  }
  const mark = (ok: boolean | null) => <span style={{ fontWeight: 800, color: ok === true ? "#1E6B3A" : ok === false ? "#B3261E" : "#6B7177" }}>{ok === true ? "✓" : ok === false ? "✗" : "—"}</span>;
  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <b>Vetting checklist</b>
      <ul style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>
        {items.filter((i) => i.auto).map((i) => <li key={i.key} style={{ fontSize: 13, margin: "4px 0" }}>{mark(i.ok)} {i.label} <span className="small-note">(checked by OBEHUB)</span>{i.note && <div className="small-note" style={{ margin: "2px 0 0 18px", color: "#9A3412" }}>{i.note}</div>}</li>)}
        <li style={{ fontSize: 13, margin: "6px 0" }}>{mark(clarity)} Questions are clear, unambiguous and free of errors —{" "}
          <label><input type="radio" name={`clarity-${id}`} checked={clarity === true} onChange={() => setClarity(true)} /> yes</label>{" "}
          <label><input type="radio" name={`clarity-${id}`} checked={clarity === false} onChange={() => setClarity(false)} /> no</label>
        </li>
      </ul>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Comments for the teacher (required when returning)" style={{ width: "100%", fontFamily: "inherit" }} aria-label="Comments" />
      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-brass btn-sm" disabled={busy} onClick={() => decide(true)}>Approve paper</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => decide(false)}>Return for improvement</button>
        {msg && <span style={{ fontSize: 13, color: msg.ok ? "#1E6B3A" : "#B3261E" }}>{msg.t}</span>}
      </div>
    </div>
  );
}
