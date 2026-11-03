"use client";
import { useState } from "react";

type Inst = { id: string; label: string; maxScore: number };
type Cell = { value: number | null; absent: boolean; error: string | null };
type Row = { roll: string; name: string; student: { id: string; roll: string; name: string } | null; duplicate: boolean; cells: Cell[] };
type P = { cols: { head: string; inst: Inst | null }[]; rows: Row[]; missing: string[]; unmatched: number; errors: number; instruments: Inst[] };

// Scan a mark sheet: photo or PDF → read → check the matches → save through the normal marks entry (each mark is
// checked there too: locks, maximum, offline queue).
export default function MarkSheetScan({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [p, setP] = useState<P | null>(null); const [map, setMap] = useState<string[]>([]); const [vals, setVals] = useState<Record<string, string>>({});
  const read = async (file: File) => {
    setBusy(true); setMsg(null); setP(null);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/instructor/courses/${courseId}/marks-scan`, { method: "POST", body: fd }); const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Could not read it." });
    setP(d); setMap(d.cols.map((c: { inst: Inst | null }) => c.inst?.id || ""));
    const v: Record<string, string> = {}; d.rows.forEach((row: Row, ri: number) => row.cells.forEach((c, ci) => { v[`${ri}|${ci}`] = c.absent ? "A" : c.value === null ? "" : String(c.value); })); setVals(v);
    setMsg({ ok: true, text: `Read ${d.rows.length} rows. Check the highlighted cells, then save.` });
  };
  const save = async () => {
    if (!p) return; setBusy(true);
    let saved = 0, failed = 0, queued = 0;
    for (const [ri, row] of p.rows.entries()) {
      if (!row.student || row.duplicate) continue;
      for (const [ci] of p.cols.entries()) {
        const instrumentId = map[ci]; const v = (vals[`${ri}|${ci}`] || "").trim(); if (!instrumentId || v === "") continue;
        const r = await fetch(`/api/instructor/courses/${courseId}/marks`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: row.student.id, instrumentId, score: /^a(bs(ent)?)?$/i.test(v) ? null : v }) }).catch(() => null);
        if (r && r.status === 202) queued++; else if (r && r.ok) saved++; else failed++;
      }
    }
    setBusy(false);
    setMsg({ ok: !failed, text: `${saved} mark(s) saved${queued ? `, ${queued} kept offline` : ""}${failed ? `, ${failed} not saved (locked or out of range — check them in the grid)` : ""}.` });
    if (!failed) setTimeout(() => location.reload(), 1200);
  };
  if (!open) return <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} data-scan-open>📷 Scan a mark sheet</button>;
  return (
    <div className="card" data-scan>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Scan a mark sheet</h3>
      <p className="small-note">Take a clear photo of the award list (roll numbers down the side, one column per quiz, assignment or question) or upload a PDF. OBEHUB reads it; you check it before anything is saved. Handwriting: check every highlighted cell.</p>
      <input type="file" accept="image/*,application/pdf" capture="environment" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); }} />
      {busy && <span className="small-note"> Working…</span>}
      {msg && <div className={msg.ok ? "ok" : "err"} role="status" style={{ marginTop: 6 }}>{msg.text}</div>}
      {p && <>
        {(p.unmatched > 0 || p.missing.length > 0) && <p className="small-note" style={{ color: "#8a5a00" }}>{p.unmatched ? `${p.unmatched} row(s) not matched to a student (skipped). ` : ""}{p.missing.length ? `Not on the sheet: ${p.missing.slice(0, 12).join(", ")}${p.missing.length > 12 ? "…" : ""}.` : ""}</p>}
        <div style={{ overflowX: "auto" }}><table style={{ fontSize: 12.5 }}>
          <thead><tr><th>Roll (sheet)</th><th>Student</th>{p.cols.map((c, ci) => <th key={ci}><div className="small-note">“{c.head}”</div><select value={map[ci]} onChange={(e) => { const m = [...map]; m[ci] = e.target.value; setMap(m); }} style={{ maxWidth: 140 }}><option value="">— skip —</option>{p.instruments.map((i) => <option key={i.id} value={i.id}>{i.label} (/{i.maxScore})</option>)}</select></th>)}</tr></thead>
          <tbody>{p.rows.map((row, ri) => <tr key={ri} style={{ opacity: !row.student || row.duplicate ? 0.5 : 1 }}><td>{row.roll}</td><td>{row.student ? `${row.student.roll} ${row.student.name}` : <span style={{ color: "#B3261E" }}>not found</span>}{row.duplicate ? " (again — skipped)" : ""}</td>
            {row.cells.map((c, ci) => <td key={ci}><input value={vals[`${ri}|${ci}`] ?? ""} onChange={(e) => setVals({ ...vals, [`${ri}|${ci}`]: e.target.value })} style={{ width: 56, background: c.error ? "#FBE4E2" : undefined }} title={c.error || undefined} /></td>)}</tr>)}</tbody>
        </table></div>
        <button type="button" className="btn" disabled={busy || !map.some(Boolean)} onClick={save} style={{ marginTop: 8 }} data-scan-save>Save these marks</button>
      </>}
    </div>
  );
}
