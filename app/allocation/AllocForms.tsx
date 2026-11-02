"use client";

import { useState } from "react";

export const post = (b: unknown) => fetch("/api/allocation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
export function Act({ body, label, confirmText, done, reload = true }: { body: unknown; label: string; confirmText?: string; done?: string; reload?: boolean }) {
  const [m, setM] = useState("");
  return <span><button type="button" className="btn btn-sm" onClick={async () => { if (confirmText && !confirm(confirmText)) return; const r = await post(body); setM(r.error || done || "Done ✓"); if (!r.error && reload) setTimeout(() => location.reload(), 600); }}>{label}</button> {m && <span className="small-note" style={{ color: m.includes("✓") ? undefined : "#B3261E" }}>{m}</span>}</span>;
}
type T = { id: string; name: string; n: number };
// Edit one row of the year plan: teachers and sections each, Visiting needed, and a reason after approval.
export function RowEdit({ draft, rowKey, teachers, visiting, sections, pool, approved }: { draft: string; rowKey: string; teachers: T[]; visiting: number; sections: number; pool: { id: string; name: string }[]; approved: boolean }) {
  const [list, setList] = useState<T[]>(teachers); const [v, setV] = useState(visiting); const [add, setAdd] = useState(""); const [reason, setReason] = useState(""); const [m, setM] = useState("");
  const total = list.reduce((a, t) => a + t.n, 0) + v;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
      {list.map((t, i) => <span key={t.id}>{t.name} <input type="number" min={0} max={sections} value={t.n} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, n: Number(e.target.value) } : x)))} style={{ width: 40 }} /></span>)}
      <select value={add} onChange={(e) => { const p = pool.find((x) => x.id === e.target.value); if (p && !list.some((x) => x.id === p.id)) setList([...list, { id: p.id, name: p.name, n: 1 }]); setAdd(""); }}><option value="">+ teacher</option>{pool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <label title="Sections nobody can take">Visiting <input type="number" min={0} max={sections} value={v} onChange={(e) => setV(Number(e.target.value))} style={{ width: 40 }} /></label>
      <span style={{ color: total < sections ? "#B3261E" : "#1B6B3A" }}>{total}/{sections}</span>
      {approved && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason (approved plan)" style={{ width: 150 }} />}
      <button type="button" className="btn-link" onClick={async () => { const r = await post({ action: "edit", draft, key: rowKey, teachers: list, visiting: v, reason }); setM(r.error || "✓"); }}>Save</button> {m && <span style={{ color: m === "✓" ? "#1B6B3A" : "#B3261E" }}>{m}</span>}
    </span>
  );
}
// A teacher's preference for one course: rank, the sections and times he wants.
export function PrefForm({ code, rank, sections, times }: { code?: string; rank?: number; sections?: string | null; times?: string | null }) {
  const [c, setC] = useState(code || ""); const [r, setR] = useState(rank || 2); const [s, setS] = useState(sections || ""); const [t, setT] = useState(times || ""); const [m, setM] = useState("");
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, fontSize: 12.5, alignItems: "center" }}>
      <input value={c} onChange={(e) => setC(e.target.value)} placeholder="Course code" disabled={!!code} style={{ width: 90 }} />
      <select value={r} onChange={(e) => setR(Number(e.target.value))}><option value={1}>1 — top choice</option><option value={2}>2 — good</option><option value={3}>3 — fine</option></select>
      <input value={s} onChange={(e) => setS(e.target.value)} placeholder="Sections, e.g. BSCS-1A, 1B" style={{ width: 150 }} />
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Times, e.g. mornings only; not Fri" style={{ width: 170 }} />
      <button type="button" className="btn btn-sm" onClick={async () => { const x = await post({ action: "pref", courseCode: c, rank: r, sections: s, times: t }); setM(x.error || "Saved ✓"); }}>Save</button>
      {code && <button type="button" className="btn-link" onClick={async () => { await post({ action: "unpref", courseCode: code }); location.reload(); }}>Remove</button>} {m}
    </span>
  );
}
export function Concern({ planId }: { planId: string }) {
  const [t, setT] = useState(""); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6 }}><input value={t} onChange={(e) => setT(e.target.value)} placeholder="Concern…" style={{ width: 220 }} /><button type="button" className="btn-link" onClick={async () => { const r = await post({ action: "concern", planId, text: t }); setM(r.error || "Sent ✓"); }}>Raise a concern</button> {m}</span>;
}
export function SwapAsk({ planId, mine, others }: { planId: string; mine: { key: string; label: string }[]; others: { key: string; label: string; teacherId: string; teacher: string }[] }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}><select value={a} onChange={(e) => setA(e.target.value)}><option value="">My section…</option>{mine.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
    <select value={b} onChange={(e) => setB(e.target.value)}><option value="">swap with…</option>{others.map((x) => <option key={`${x.key}|${x.teacherId}`} value={`${x.key}|${x.teacherId}`}>{x.teacher}: {x.label}</option>)}</select>
    <button type="button" className="btn btn-sm" onClick={async () => { const [row, ...id] = b.split("|"); const otherRow = b.slice(0, b.lastIndexOf("|")); const r = await post({ action: "swap", planId, myRow: a, otherRow, otherId: b.slice(b.lastIndexOf("|") + 1) }); void row; void id; setM(r.error || "Asked ✓"); }}>Ask to swap</button> {m}</span>;
}

// The preference window: teachers can save course preferences only between these dates (none set = always open).
export function WindowForm({ opens, closes, note }: { opens: string; closes: string; note: string }) {
  const [v, setV] = useState({ opens, closes, note }); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "end", fontSize: 13 }} data-window>
    <label>Opens<br /><input type="date" value={v.opens} onChange={(e) => setV({ ...v, opens: e.target.value })} /></label>
    <label>Closes<br /><input type="date" value={v.closes} onChange={(e) => setV({ ...v, closes: e.target.value })} /></label>
    <label>Message to teachers<br /><input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} style={{ minWidth: 220 }} /></label>
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "prefWindow", ...v }); setM(r.error || "Saved — teachers are told ✓"); }}>Save window</button>
    {(opens || closes) && <button type="button" className="btn-link" onClick={async () => { const r = await post({ action: "prefWindow", opens: "", closes: "" }); setM(r.error || "Window removed — always open"); if (!r.error) setV({ opens: "", closes: "", note: "" }); }}>Remove</button>}
    <span className="small-note">{m}</span></span>;
}
// A mentor for a teacher's first time on a course.
export function MentorPick({ teacherId, code, current, suggest, pool }: { teacherId: string; code: string; current: string; suggest: { id: string; name: string; why: string }[]; pool: { id: string; name: string }[] }) {
  const [v, setV] = useState(current); const [m, setM] = useState("");
  const rest = pool.filter((p) => p.id !== teacherId && !suggest.some((s) => s.id === p.id));
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><select value={v} onChange={(e) => setV(e.target.value)} data-mentor={`${teacherId}|${code}`}><option value="">— no mentor —</option>{suggest.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.why})</option>)}{rest.length > 0 && <optgroup label="Others">{rest.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}</select>
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "mentor", teacherId, code, mentorId: v }); setM(r.error || "Saved ✓ — both are told"); }}>Save</button><span className="small-note">{m}</span></span>;
}
