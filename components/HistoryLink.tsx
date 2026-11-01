"use client";

import { useState } from "react";

type Row = { at: string; who: string; action: string; changes: { field: string; from: string; to: string }[] };
// A small "History" link: who · when · what changed (old → new), read-only (Adeel prompt §3).
export default function HistoryLink({ type, id, label = "History" }: { type: string; id: string; label?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  async function show() {
    setOpen(!open);
    if (rows) return;
    const d = await fetch(`/api/history?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => ({ history: [] }));
    setRows(d.history || []);
  }
  const shown = (rows || []).filter((r) => !who || r.who === who);
  return (
    <span style={{ position: "relative" }}>
      <button type="button" className="btn-link small-note" onClick={show} title="Who changed this?">{label}</button>
      {open && (
        <div style={{ position: "absolute", zIndex: 20, right: 0, top: 20, width: 360, maxHeight: 320, overflow: "auto", background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 10, boxShadow: "0 4px 12px rgba(0,0,0,.12)", fontSize: 12.5, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <b>Change history</b>
            {rows && rows.length > 1 && <select value={who} onChange={(e) => setWho(e.target.value)} style={{ fontSize: 12 }}><option value="">Everyone</option>{Array.from(new Set(rows.map((r) => r.who))).map((w) => <option key={w}>{w}</option>)}</select>}
          </div>
          {!rows ? <p>Loading…</p> : shown.length === 0 ? <p className="small-note">No changes recorded yet.</p> : shown.map((r, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid #eee" : "none", padding: "5px 0" }}>
              <div><b>{r.who}</b> · {new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} <span className="small-note">{r.action.toLowerCase().replace(/_/g, " ")}</span></div>
              {r.changes.map((c, j) => <div key={j} className="small-note">{c.field}: {c.from} → {c.to}</div>)}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
