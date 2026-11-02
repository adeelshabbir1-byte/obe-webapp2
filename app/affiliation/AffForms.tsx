"use client";

import { useState } from "react";

type F = { key: string; label: string; type?: string; options?: string[]; side?: string };
const post = (b: unknown) => fetch("/api/affiliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
const Input = ({ f, v, on }: { f: F; v: string; on: (x: string) => void }) => f.type === "select" ? <select value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{(f.options || []).map((o) => <option key={o}>{o}</option>)}</select> : f.type === "long" ? <textarea rows={2} value={v} onChange={(e) => on(e.target.value)} style={{ width: "100%" }} /> : <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={v} onChange={(e) => on(e.target.value)} />;

export function NewRecord({ kind, fields, side, colleges }: { kind: string; fields: F[]; side: string; colleges: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState(""); const [col, setCol] = useState(""); const [d, setD] = useState<Record<string, string>>({}); const [m, setM] = useState("");
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>+ New</button>;
  return (
    <div className="card" style={{ display: "grid", gap: 6, fontSize: 12.5 }}>
      <label>Title <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 300 }} /></label>
      {side === "UNI" && colleges.length > 0 && <label>College <select value={col} onChange={(e) => setCol(e.target.value)}><option value="">All / none</option>{colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      {fields.filter((f) => !f.side || f.side === side).map((f) => <label key={f.key} style={{ display: "grid" }}>{f.label}<Input f={f} v={d[f.key] || ""} on={(x) => setD({ ...d, [f.key]: x })} /></label>)}
      <span><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "create", kind, title, collegeId: col || null, data: d }); setM(r.error || "Saved ✓"); if (!r.error) setTimeout(() => location.reload(), 600); }}>Save</button> <button type="button" className="btn-link" onClick={() => setOpen(false)}>Cancel</button> {m}</span>
    </div>
  );
}
export function EditRecord({ id, fields, side, data }: { id: string; fields: F[]; side: string; data: Record<string, string> }) {
  const [d, setD] = useState<Record<string, string>>(data); const [m, setM] = useState("");
  const mine = fields.filter((f) => !f.side || f.side === side);
  return <div style={{ display: "grid", gap: 4, fontSize: 12.5 }}>{mine.map((f) => <label key={f.key} style={{ display: "grid" }}>{f.label}<Input f={f} v={String(d[f.key] ?? "")} on={(x) => setD({ ...d, [f.key]: x })} /></label>)}<span><button type="button" className="btn-link" onClick={async () => { const r = await post({ action: "edit", id, data: d }); setM(r.error || "Saved ✓"); }}>Save changes</button> {m}</span></div>;
}
export function Move({ id, to }: { id: string; to: string[] }) {
  const [note, setNote] = useState(""); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note" style={{ width: 160 }} />{to.map((t) => <button key={t} type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "move", id, to: t, note }); setM(r.error || "✓"); if (!r.error) setTimeout(() => location.reload(), 500); }}>{t.toLowerCase().replace(/_/g, " ")}</button>)} {m && <span style={{ color: m === "✓" ? "#1B6B3A" : "#B3261E" }}>{m}</span>}</span>;
}
export function Ack({ id }: { id: string }) { const [m, setM] = useState(""); return m ? <span className="small-note">{m}</span> : <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "ack", id }); setM(r.error || "Acknowledged ✓"); }}>Acknowledge</button>; }
export function Marks({ id, rows, side }: { id: string; rows: { roll: string; mark: number | null; ext?: boolean; int?: boolean }[]; side: string }) {
  const [text, setText] = useState(rows.map((r) => `${r.roll}, ${r.mark ?? ""}`).join("\n")); const [m, setM] = useState("");
  const parse = () => text.split(/\n/).map((l) => l.split(/[,\t]/).map((x) => x.trim())).filter((x) => x[0]).map(([roll, mark]) => ({ roll, mark }));
  const conf = rows.filter((r) => (side === "UNI" ? r.ext : r.int)).length;
  return (
    <div style={{ fontSize: 12.5 }}>
      <div className="small-note">One line per student: roll number, agreed mark (blank = absent). {rows.length ? `${rows.filter((r) => r.ext && r.int).length} of ${rows.length} confirmed by both; you confirmed ${conf}.` : ""}</div>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", fontFamily: "monospace" }} />
      <button type="button" className="btn-link" onClick={async () => { const r = await post({ action: "marks", id, rows: parse(), confirm: false }); setM(r.error || "Saved"); }}>Save</button> · <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "marks", id, rows: parse(), confirm: true }); setM(r.error || `Confirmed as the ${side === "UNI" ? "external" : "internal"} examiner ✓`); }}>Confirm as {side === "UNI" ? "external" : "internal"} examiner</button> {m}
    </div>
  );
}
export function RatesForm({ rates }: { rates: Record<string, unknown> }) {
  const [t, setT] = useState(JSON.stringify(rates, null, 1)); const [m, setM] = useState("");
  return <div style={{ fontSize: 12.5 }}><textarea rows={8} value={t} onChange={(e) => setT(e.target.value)} style={{ width: "100%", fontFamily: "monospace" }} /><button type="button" className="btn btn-sm" onClick={async () => { try { const r = await post({ action: "rates", rates: JSON.parse(t) }); setM(r.error || "Saved ✓"); } catch { setM("Not valid JSON."); } }}>Save rates</button> {m}<p className="small-note">perStudent / paperSetting / perScript / duty are taxable (taxPct); TA/DA is tax-free: perKm (own car, both ways), fare as paid, daily allowance by pay scale (daBps: up to BPS → amount), night stay.</p></div>;
}

export function Codes({ id }: { id: string }) {
  const [v, setV] = useState(""); const [m, setM] = useState("");
  return <div><textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} placeholder="Roll numbers, one per line" style={{ width: "100%" }} /><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "codes", id, rolls: v }); if (r.error) setM(r.error); else location.reload(); }}>Generate script codes</button> {m}</div>;
}
export function ScriptMarks({ id, codes, marks, max }: { id: string; codes: string[]; marks: Record<string, number | null>; max: number }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(codes.map((c) => [c, marks[c] == null ? "" : String(marks[c])]))); const [m, setM] = useState("");
  return <div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 4 }}>{codes.map((c) => <label key={c} style={{ fontSize: 12 }}>{c} <input value={v[c]} onChange={(e) => setV({ ...v, [c]: e.target.value })} style={{ width: 50 }} />/{max}</label>)}</div>
    <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={async () => { const r = await post({ action: "scripts", id, rows: codes.map((c) => ({ code: c, mark: v[c] })) }); setM(r.error || "Saved ✓"); }}>Save marks</button> <span className="small-note">{m}</span></div>;
}

export function Officer({ current, staff, side }: { current: string; staff: { id: string; name: string }[]; side: string }) {
  const [v, setV] = useState(current); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{side === "UNI" ? "Affiliation office handled by" : "Affiliation focal person"} <select value={v} onChange={(e) => setV(e.target.value)}><option value="">— nobody —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "officer", userId: v }); setM(r.error || "Assigned ✓ — they were told"); }}>Assign</button> <span className="small-note">{m}</span></span>;
}

export function JobsForm({ jobs, staff }: { jobs: { key: string; label: string; does: string; holders: string[] }[]; staff: { id: string; name: string }[] }) {
  const [v, setV] = useState<Record<string, string[]>>(Object.fromEntries(jobs.map((j) => [j.key, j.holders]))); const [add, setAdd] = useState<Record<string, string>>({}); const [m, setM] = useState("");
  const name = (id: string) => staff.find((s) => s.id === id)?.name || id;
  return <div style={{ marginTop: 8 }}><p className="small-note" style={{ marginTop: 0 }}>Each step is done only by the people named for its job (and the Institute Head). A job with nobody named is done by the Affiliation office and the heads.</p>
    <table className="table" style={{ fontSize: 12.5 }}><tbody>{jobs.map((j) => <tr key={j.key}><td style={{ width: "40%" }}><b>{j.label}</b><div className="small-note">{j.does}</div></td><td>
      {(v[j.key] || []).map((id) => <span key={id} style={{ display: "inline-block", margin: "0 6px 4px 0", padding: "1px 8px", borderRadius: 10, background: "rgba(27,95,170,.1)" }}>{name(id)} <button type="button" className="btn-link" aria-label={`Remove ${name(id)}`} onClick={() => setV({ ...v, [j.key]: (v[j.key] || []).filter((x) => x !== id) })}>×</button></span>)}
      <select value={add[j.key] || ""} onChange={(e) => { const id = e.target.value; if (id) setV({ ...v, [j.key]: Array.from(new Set([...(v[j.key] || []), id])) }); setAdd({ ...add, [j.key]: "" }); }}><option value="">+ add a person…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    </td></tr>)}</tbody></table>
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "jobs", jobs: v }); setM(r.error || "Saved ✓ — new people were told"); }}>Save</button> <span className="small-note">{m}</span></div>;
}
