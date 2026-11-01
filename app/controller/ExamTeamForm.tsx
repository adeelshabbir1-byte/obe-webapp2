"use client";

import { useState } from "react";

type M = { userId: string; name: string; programs: string[] };
// The Controller's team: add people and tick the programs each one handles.
export default function ExamTeamForm({ team, staff, programs }: { team: M[]; staff: { id: string; name: string }[]; programs: string[] }) {
  const [list, setList] = useState<M[]>(team); const [add, setAdd] = useState(""); const [m, setM] = useState("");
  const toggle = (i: number, p: string) => setList(list.map((x, j) => (j === i ? { ...x, programs: x.programs.includes(p) ? x.programs.filter((y) => y !== p) : [...x.programs, p] } : x)));
  return <div style={{ marginTop: 8 }}>
    {list.map((x, i) => <div key={x.userId} style={{ padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 }}><b>{x.name}</b> <button type="button" className="btn-link" onClick={() => setList(list.filter((_, j) => j !== i))}>remove</button>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>{programs.map((p) => <label key={p} style={{ fontSize: 12.5 }}><input type="checkbox" checked={x.programs.includes(p)} onChange={() => toggle(i, p)} /> {p}</label>)}</div></div>)}
    {!list.length && <p className="small-note">No one yet. Add people from your office and give each the programs they handle.</p>}
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><select value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Add a person…</option>{staff.filter((s) => !list.some((x) => x.userId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button type="button" className="btn-link" disabled={!add} onClick={() => { const s = staff.find((x) => x.id === add); if (s) setList([...list, { userId: s.id, name: s.name, programs: [] }]); setAdd(""); }}>+ add</button>
      <button type="button" className="btn btn-sm" onClick={async () => { const r = await fetch("/api/controller", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "team", team: list }) }).then((x) => x.json()).catch(() => ({ error: "Could not save." })); setM(r.error || r.message); }}>Save team</button> <span className="small-note">{m}</span></div>
  </div>;
}
