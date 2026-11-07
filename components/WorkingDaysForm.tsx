"use client";
import { useState } from "react";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const post = (b: unknown) => fetch("/api/working-days", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
const Days = ({ v, set }: { v: number[]; set: (d: number[]) => void }) => <span style={{ display: "inline-flex", gap: 4 }}>{WEEK.map((w, i) => <label key={w} style={{ fontSize: 12.5 }}><input type="checkbox" checked={v.includes(i)} onChange={(e) => set(e.target.checked ? [...v, i].sort() : v.filter((x) => x !== i))} />{w}</label>)}</span>;

/** HR sets the institute's week, and a working pattern / off days for one person or a group (queue item 22). */
export default function WorkingDaysForm({ week, people }: { week: number[]; people: { id: string; name: string; role: string; days: number[] | null; off: string[] }[] }) {
  const [w, setW] = useState(week); const [sel, setSel] = useState<string[]>([]); const [d, setD] = useState<number[]>([5, 6, 0]); const [off, setOff] = useState(""); const [m, setM] = useState("");
  const done = (r: { error?: string }) => { if (r.error) setM(r.error); else location.reload(); };
  return <div>
    <div className="card"><b>Institute week</b> <Days v={w} set={setW} /> <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "week", days: w }))}>Save</button></div>
    <div className="card"><b>Set a pattern for the people ticked below</b> ({sel.length})<div style={{ margin: "6px 0" }}>Working days <Days v={d} set={setD} /></div>
      <label style={{ fontSize: 12.5 }}>Extra off days (YYYY-MM-DD, comma separated; blank keeps them)<br /><input value={off} onChange={(e) => setOff(e.target.value)} style={{ width: "100%" }} placeholder="2026-12-10, 2026-12-11" /></label>
      <div style={{ marginTop: 6, display: "flex", gap: 8 }}><button type="button" className="btn btn-sm" disabled={!sel.length} onClick={async () => done(await post({ action: "people", userIds: sel, days: d, ...(off.trim() ? { offDates: off.split(/[,\s]+/).filter(Boolean) } : {}) }))}>Apply</button>
        <button type="button" className="btn btn-sm btn-secondary" disabled={!sel.length} onClick={async () => done(await post({ action: "people", userIds: sel, reset: true, offDates: [] }))}>Back to the institute week</button><span className="small-note">{m}</span></div></div>
    <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 13 }}><thead><tr><th><input type="checkbox" aria-label="Tick all" onChange={(e) => setSel(e.target.checked ? people.map((p) => p.id) : [])} /></th><th>Name</th><th>Role</th><th>Working days</th><th>Extra off days</th></tr></thead>
      <tbody>{people.map((p) => <tr key={p.id}><td><input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} aria-label={`Tick ${p.name}`} /></td><td>{p.name}</td><td>{p.role}</td><td>{p.days ? p.days.map((x) => WEEK[x]).join(" ") : <span className="small-note">institute week</span>}</td><td>{p.off.join(", ") || "—"}</td></tr>)}</tbody></table></div>
  </div>;
}
