"use client";

import { useState } from "react";

// Client parts of the 8-step ODL wizard (lib/odlWizard.ts).
const post = (b: unknown) => fetch("/api/collab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
const save = (id: string, data: Record<string, unknown>) => post({ action: "save", id, data });
type Person = { id: string; name: string };

export function ProgramPick({ id, value, programs }: { id: string; value: string; programs: string[] }) {
  const [v, setV] = useState(value); const [m, setM] = useState("");
  return <label style={{ fontSize: 13 }}>Face-to-face programme this comes from<br />
    <select value={v} onChange={(e) => setV(e.target.value)}><option value="">— choose —</option>{programs.map((p) => <option key={p}>{p}</option>)}</select>{" "}
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await save(id, { degreeProgram: v }); if (r.error) setM(r.error); else location.reload(); }}>Save and check</button> <span className="small-note">{m}</span></label>;
}
export function FacultyPick({ id, chosen, staff }: { id: string; chosen: Person[]; staff: Person[] }) {
  const [list, setList] = useState<Person[]>(chosen); const [add, setAdd] = useState(""); const [m, setM] = useState("");
  return <div style={{ fontSize: 13 }}>Full-time faculty designated for ODL (2.5)
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0" }}>{list.map((p) => <span key={p.id} style={{ padding: "2px 8px", borderRadius: 10, background: "#EEF3FA" }}>{p.name} <button type="button" className="btn-link" aria-label={`Remove ${p.name}`} onClick={() => setList(list.filter((x) => x.id !== p.id))}>×</button></span>)}</div>
    <select value={add} onChange={(e) => setAdd(e.target.value)}><option value="">— add a teacher —</option>{staff.filter((s) => !list.some((x) => x.id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{" "}
    <button type="button" className="btn-link" onClick={() => { const s = staff.find((x) => x.id === add); if (s) setList([...list, { id: s.id, name: s.name }]); setAdd(""); }}>Add</button>{" "}
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await save(id, { odlFaculty: list }); if (r.error) setM(r.error); else location.reload(); }}>Save and check</button> <span className="small-note">{m}</span></div>;
}
export function SendBos({ id, committees }: { id: string; committees: { id: string; label: string }[] }) {
  const [c, setC] = useState(committees[0]?.id || ""); const [m, setM] = useState("");
  if (!committees.length) return <span className="small-note">Set up the Board of Studies under Committees to send the proposal from here.</span>;
  return <span style={{ fontSize: 13 }}><select value={c} onChange={(e) => setC(e.target.value)}>{committees.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>{" "}
    <button type="button" className="btn btn-sm btn-secondary" onClick={async () => { const r = await post({ action: "sendBos", id, committeeId: c }); setM(r.error || "Sent — it is on the committee's agenda ✓"); }}>Send the proposal for approval</button> <span className="small-note">{m}</span></span>;
}
export function ReadinessRow({ id, n, yes, evidence }: { id: string; n: number; yes: boolean; evidence: string }) {
  const [y, setY] = useState(yes); const [e, setE] = useState(evidence); const [m, setM] = useState("");
  const commit = async (yy: boolean, ee: string) => { const r = await save(id, { readiness: { [n]: { yes: yy, evidence: ee } } }); setM(r.error || "✓"); };
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><label><input type="checkbox" checked={y} onChange={(ev) => { setY(ev.target.checked); commit(ev.target.checked, e); }} /> Yes</label>
    <input value={e} onChange={(ev) => setE(ev.target.value)} onBlur={() => commit(y, e)} placeholder="evidence (Annex no., link)" aria-label={`Evidence for question ${n}`} style={{ width: 210, fontSize: 12 }} /><span className="small-note">{m}</span></span>;
}
export function RolePick({ id, k, label, value, staff }: { id: string; k: string; label: string; value: string; staff: Person[] }) {
  const [v, setV] = useState(value); const [m, setM] = useState("");
  return <label style={{ fontSize: 13, display: "block", margin: "4px 0" }}>{label}<br />
    <select value={v} onChange={async (e) => { setV(e.target.value); const s = staff.find((x) => x.id === e.target.value); const r = await save(id, { roles: { [k]: s ? { id: s.id, name: s.name } : { id: "", name: "" } } }); setM(r.error || "✓"); }}>
      <option value="">— not named —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> <span className="small-note">{m}</span></label>;
}
export function PerCh({ id, value }: { id: string; value: boolean }) {
  const [v, setV] = useState(value);
  return <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={v} onChange={async (e) => { setV(e.target.checked); const r = await save(id, { activitiesPerCh: e.target.checked }); if (!r.error) location.reload(); }} /> Count the 8.1.ii.e activities per credit hour (the clause says &quot;to complete one credit hour&quot;; your QEC decides how it reads)</label>;
}
