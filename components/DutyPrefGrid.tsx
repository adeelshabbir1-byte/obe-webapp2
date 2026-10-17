"use client";
import { useState } from "react";

/** Tick the exam slots you prefer for invigilation (rows = dates, columns = times) and how many duties a day you want. */
export default function DutyPrefGrid({ sessionId, days, slots, initial, maxPerDay, note }: { sessionId: string; days: { key: string; label: string }[]; slots: string[]; initial: string[]; maxPerDay: number; note: string }) {
  const [sel, setSel] = useState(new Set(initial)); const [max, setMax] = useState(maxPerDay); const [n, setN] = useState(note); const [msg, setMsg] = useState("");
  const toggle = (k: string) => { const s = new Set(sel); if (s.has(k)) s.delete(k); else s.add(k); setSel(s); };
  async function save() { const r = await fetch(`/api/exams/${sessionId}/availability`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pref", slots: Array.from(sel), maxPerDay: max, note: n }) }); const d = await r.json().catch(() => ({})); setMsg(r.ok ? "Saved." : d.error || "Failed."); }
  const cell = { border: "1px solid #CBD5E1", padding: 6, textAlign: "center" as const };
  return (
    <div>
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse" }}>
        <thead><tr><th style={{ ...cell, background: "#F4F6F9" }}>Date</th>{slots.map((s, i) => <th key={i} style={{ ...cell, background: "#F4F6F9" }}>{s}</th>)}</tr></thead>
        <tbody>{days.map((d) => <tr key={d.key}><th style={{ ...cell, background: "#F4F6F9", textAlign: "left" }}>{d.label}</th>{slots.map((_, i) => { const k = `${d.key}:${i}`; return <td key={i} style={{ ...cell, background: sel.has(k) ? "#E1F0E3" : undefined, cursor: "pointer" }} onClick={() => toggle(k)}><input type="checkbox" checked={sel.has(k)} readOnly aria-label={`${d.label} ${slots[i]}`} /></td>; })}</tr>)}</tbody>
      </table></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <label style={{ fontSize: 13 }}>Most duties per day <select value={max} onChange={(e) => setMax(Number(e.target.value))}>{[1, 2, 3].map((x) => <option key={x}>{x}</option>)}</select></label>
        <input placeholder="Note to the exam branch (optional)" value={n} onChange={(e) => setN(e.target.value)} style={{ width: 280 }} />
        <button type="button" className="btn btn-sm" onClick={save}>Save my preferences</button><span style={{ fontSize: 13 }}>{msg}</span>
      </div>
      <p className="small-note">Ticked slots are preferred, not guaranteed: duties are shared evenly first. The daily limit is always respected.</p>
    </div>
  );
}
