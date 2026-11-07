"use client";
import { useState } from "react";

// Queue item 23: faculty status editing, bulk change, full load, requirement versions and letters.
const post = (b: unknown) => fetch("/api/faculty-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
export const DEGREES = [["PHD", "PhD"], ["MS", "MS / MPhil (18 years)"], ["BS", "BS (16 years)"], ["OTHER", "Other"]] as const;
export const EMPLOYMENT = [["PERMANENT", "Permanent"], ["CONTRACT", "Contract"], ["VISITING", "Visiting"], ["LAB_ENGINEER", "Lab engineer"]] as const;
export const CLASSES = [["", "worked out"], ["DEDICATED", "Dedicated / full-time"], ["SHARED", "Shared"], ["VISITING", "Visiting"], ["DEMONSTRATOR", "Demonstrator / TA / lab engineer"]] as const;
export const AQPQ = [["", "worked out"], ["AQ", "AQ"], ["PQ", "PQ"], ["OTHER", "Neither"]] as const;
type P = { id: string; name: string; degree: string; designation: string; employment: string; cls: string | null; aqpq: string | null };

const Sel = ({ v, opts, on, label, dis }: { v: string; opts: readonly (readonly [string, string])[]; on: (x: string) => void; label: string; dis?: boolean }) =>
  <select value={v} disabled={dis} onChange={(e) => on(e.target.value)} aria-label={label} style={{ fontSize: 12.5 }}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>;

export function StatusTable({ people, can, nbeac }: { people: P[]; can: boolean; nbeac: boolean }) {
  const [rows, setRows] = useState(people); const [sel, setSel] = useState<string[]>([]); const [m, setM] = useState("");
  const save = async (id: string, k: string, v: string) => { setRows(rows.map((r) => (r.id === id ? { ...r, [k === "facultyClass" ? "cls" : k]: v } : r))); const r = await post({ action: "save", userId: id, values: { [k]: v || null } }); setM(r.error || "Saved ✓"); };
  const [bk, setBk] = useState("degree"); const [bv, setBv] = useState("MS");
  const opts = bk === "degree" ? DEGREES : bk === "employment" ? EMPLOYMENT : bk === "aqpq" ? AQPQ : CLASSES;
  return <div>
    {can && <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
      <b>Change {sel.length} ticked</b>
      <select value={bk} onChange={(e) => { setBk(e.target.value); setBv(""); }}><option value="degree">Highest degree</option><option value="employment">Employment</option><option value="facultyClass">NCEAC class</option>{nbeac && <option value="aqpq">NBEAC AQ / PQ</option>}</select>
      <Sel v={bv} opts={opts} on={setBv} label="New value" />
      <button type="button" className="btn btn-sm" disabled={!sel.length} onClick={async () => { const r = await post({ action: "bulk", ids: sel, values: { [bk]: bv || null } }); setM(r.error || `Changed ${r.n} ✓`); if (!r.error) setTimeout(() => location.reload(), 600); }}>Apply</button>
      <span className="small-note" role="status">{m}</span></div>}
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="table" style={{ fontSize: 12.5 }}><thead><tr>{can && <th><input type="checkbox" aria-label="Tick all" checked={sel.length === rows.length && rows.length > 0} onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} /></th>}<th>Name</th><th>Designation</th><th>Highest degree</th><th>Employment</th><th>NCEAC class</th>{nbeac && <th>NBEAC AQ / PQ</th>}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}>
          {can && <td><input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} aria-label={`Tick ${r.name}`} /></td>}
          <td>{r.name}</td>
          <td>{can ? <input defaultValue={r.designation} onBlur={(e) => e.target.value !== r.designation && save(r.id, "designation", e.target.value)} style={{ width: 150, fontSize: 12.5 }} aria-label={`Designation of ${r.name}`} /> : r.designation || "—"}</td>
          <td><Sel v={r.degree} opts={DEGREES} on={(v) => save(r.id, "degree", v)} label={`Degree of ${r.name}`} dis={!can} /></td>
          <td><Sel v={r.employment} opts={EMPLOYMENT} on={(v) => save(r.id, "employment", v)} label={`Employment of ${r.name}`} dis={!can} /></td>
          <td><Sel v={r.cls || ""} opts={CLASSES} on={(v) => save(r.id, "facultyClass", v)} label={`NCEAC class of ${r.name}`} dis={!can} /></td>
          {nbeac && <td><Sel v={r.aqpq || ""} opts={AQPQ} on={(v) => save(r.id, "aqpq", v)} label={`AQ PQ of ${r.name}`} dis={!can} /></td>}
        </tr>)}</tbody></table>
      {can && <p className="small-note" role="status">{m}</p>}
    </div></div>;
}

export function FullLoadForm({ value, can }: { value: number; can: boolean }) {
  const [v, setV] = useState(String(value)); const [m, setM] = useState("");
  return <span style={{ fontSize: 12.5 }}>Full load: <input type="number" min={1} max={30} value={v} disabled={!can} onChange={(e) => setV(e.target.value)} style={{ width: 55 }} aria-label="Full load credit hours a semester" /> credit hours a semester {can && <button type="button" className="btn btn-sm btn-secondary" onClick={async () => { const r = await post({ action: "fullload", value: Number(v) }); setM(r.error || "Saved ✓"); if (!r.error) setTimeout(() => location.reload(), 500); }}>Save</button>} <span className="small-note">{m}</span></span>;
}

export function VersionForm({ body, fields, current }: { body: string; fields: { key: string; label: string; clause: string; def: number }[]; current: Record<string, number> }) {
  const [label, setLabel] = useState(""); const [term, setTerm] = useState("Fall"); const [year, setYear] = useState(String(new Date().getFullYear())); const [note, setNote] = useState("");
  const [r, setR] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, String(current[f.key] ?? f.def)]))); const [m, setM] = useState("");
  return <div style={{ fontSize: 12.5 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
      <label>Version name<br /><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${body} Manual 2026`} style={{ width: 220 }} /></label>
      <label>Applies from<br /><select value={term} onChange={(e) => setTerm(e.target.value)}><option>Fall</option><option>Spring</option></select> <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 70 }} aria-label="Year" /></label>
      <label>Source / note<br /><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Manual, page, notification number" style={{ width: 280 }} /></label>
    </div>
    <table className="table" style={{ fontSize: 12.5, marginTop: 6 }}><tbody>{fields.map((f) => <tr key={f.key}><td>{f.label}</td><td><input type="number" step="any" value={r[f.key]} onChange={(e) => setR({ ...r, [f.key]: e.target.value })} style={{ width: 70 }} aria-label={f.label} /></td><td className="small-note">{f.clause}</td></tr>)}</tbody></table>
    <button type="button" className="btn btn-sm" onClick={async () => { const x = await post({ action: "version", body, label, fromTerm: term, fromYear: Number(year), note, rules: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) }); setM(x.error || "Saved ✓ — it applies from that term"); if (!x.error) setTimeout(() => location.reload(), 700); }}>Save as a new version</button> <span className="small-note" role="status">{m}</span>
  </div>;
}
export function PostButton({ body, label, confirm: c }: { body: Record<string, unknown>; label: string; confirm?: string }) {
  const [m, setM] = useState("");
  return <span><button type="button" className="btn-link" onClick={async () => { if (c && !window.confirm(c)) return; const r = await post(body); setM(r.error || "✓"); if (!r.error) setTimeout(() => location.reload(), 500); }}>{label}</button> <span className="small-note">{m}</span></span>;
}

export function LetterForm({ kinds, programs, cycles }: { kinds: string[]; programs: string[]; cycles: { id: string; label: string }[] }) {
  const [m, setM] = useState(""); const [busy, setBusy] = useState(false);
  return <form style={{ fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); const fd = new FormData(e.currentTarget); const r = await fetch("/api/faculty-status", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Could not reach OBEHUB." })); setBusy(false); setM(r.error || "Added ✓"); if (!r.error) setTimeout(() => location.reload(), 600); }}>
    <label>With<br /><select name="counterpart"><option>NCEAC</option><option>HEC</option><option>NBEAC</option><option>PEC</option><option>Other</option></select></label>
    <label>Direction<br /><select name="direction"><option value="IN">Received</option><option value="OUT">Sent</option></select></label>
    <label>Kind<br /><select name="kind">{kinds.map((k) => <option key={k}>{k}</option>)}</select></label>
    <label>Program<br /><select name="program"><option value="">Whole institute</option>{programs.map((p) => <option key={p}>{p}</option>)}</select></label>
    <label>Visit cycle<br /><select name="cycleId"><option value="">—</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <label>Reference no.<br /><input name="refNo" style={{ width: 120 }} /></label>
    <label>Date<br /><input name="letterDate" type="date" /></label>
    <label>Subject<br /><input name="subject" required style={{ width: 240 }} /></label>
    <label>File (PDF, Word, image; up to 15 MB)<br /><input name="file" type="file" /></label>
    <button className="btn btn-sm" disabled={busy}>{busy ? "Uploading…" : "Add"}</button> <span className="small-note" role="status">{m}</span>
  </form>;
}
