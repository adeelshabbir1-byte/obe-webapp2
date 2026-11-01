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
