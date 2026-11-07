"use client";
import { useState } from "react";
import type { Pref } from "../lib/examDutiesCore";

/** Queue item 17: which days, how spread, which time of day, and days not available. The grid of duty codes
 * (D1,1 = day 1 slot 1) is shown with the dates, and how many duties this person is expected to take. */
export default function DutyOptsForm({ sessionId, days, slots, initial, quota }: { sessionId: string; days: { key: string; label: string }[]; slots: string[]; initial: Pref; quota: number }) {
  const [p, setP] = useState<Pref>({ days: initial.days || [], unavailable: initial.unavailable || [], maxDays: initial.maxDays || 0, perDay: initial.perDay || 1, time: initial.time || "ANY" });
  const [m, setM] = useState("");
  const tog = (k: "days" | "unavailable", d: string) => setP({ ...p, [k]: (p[k] || []).includes(d) ? (p[k] || []).filter((x) => x !== d) : [...(p[k] || []), d] });
  return <div>
    <p style={{ fontSize: 13, margin: "0 0 6px" }}>You are expected to take about <b>{quota}</b> duties this session. Tick the days you prefer (at least enough for that), and any you are not available.</p>
    <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Day</th><th>Duty codes</th><th>Prefer</th><th>Not available</th></tr></thead>
      <tbody>{days.map((d, i) => <tr key={d.key}><td>{d.label}</td><td>{slots.map((t, j) => `D${i + 1},${j + 1} (${t})`).join(" · ")}</td>
        <td><input type="checkbox" checked={(p.days || []).includes(d.key)} onChange={() => tog("days", d.key)} aria-label={`Prefer ${d.label}`} /></td>
        <td><input type="checkbox" checked={(p.unavailable || []).includes(d.key)} onChange={() => tog("unavailable", d.key)} aria-label={`Not available ${d.label}`} /></td></tr>)}</tbody></table></div>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 13, marginTop: 6 }}>
      <label>All my duties within <input type="number" min={0} value={p.maxDays || 0} onChange={(e) => setP({ ...p, maxDays: Number(e.target.value) })} style={{ width: 55 }} /> days <span className="small-note">(0 = any)</span></label>
      <label>At most <select value={p.perDay} onChange={(e) => setP({ ...p, perDay: Number(e.target.value) })}>{[1, 2, 3].map((x) => <option key={x}>{x}</option>)}</select> a day</label>
      <label>Time of day <select value={p.time} onChange={(e) => setP({ ...p, time: e.target.value as Pref["time"] })}><option value="ANY">any</option><option value="LAST">last slot, not morning</option><option value="MORNING">morning</option></select></label>
      <button type="button" className="btn btn-sm" onClick={async () => { if ((p.days || []).length && (p.days || []).length * (p.perDay || 1) < quota) { setM(`Pick more days: ${quota} duties need at least ${Math.ceil(quota / (p.perDay || 1))}.`); return; } const r = await fetch(`/api/exams/${sessionId}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prefs", opts: p }) }).then((x) => x.json()).catch(() => ({ error: "Could not save." })); setM(r.error || "Saved ✓"); }}>Save</button><span className="small-note">{m}</span>
    </div>
    <p className="small-note">Preferences are kept where possible; fairness across colleagues comes first, and you are told if one could not be met. Leave, official work and your own classes are blocked automatically.</p>
  </div>;
}
