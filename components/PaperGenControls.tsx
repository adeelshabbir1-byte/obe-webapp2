"use client";
import { useState } from "react";

// Queue item 18: settings proposal / approval, the bank sufficiency check, generation, review and printing.
const post = (b: unknown) => fetch("/api/paper-generation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
type Spec = { total: number; minutes: number; cloShares: Record<string, number>; versions?: number; difficulty?: Record<string, number> };

export function SpecForm({ code, examType, clos, spec, can }: { code: string; examType: string; clos: string[]; spec: Spec | null; can: boolean }) {
  const [s, setS] = useState<Spec>(spec || { total: examType === "Midterm" ? 30 : 50, minutes: examType === "Midterm" ? 90 : 180, cloShares: Object.fromEntries(clos.map((c) => [c, 1])), versions: 2, difficulty: { EASY: 2, MEDIUM: 6, HARD: 2 } });
  const [m, setM] = useState("");
  const n = (v: string) => Math.max(0, Number(v) || 0);
  return <div style={{ fontSize: 12.5 }}>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <label>Marks <input type="number" value={s.total} disabled={!can} onChange={(e) => setS({ ...s, total: n(e.target.value) })} style={{ width: 60 }} /></label>
      <label>Minutes <input type="number" value={s.minutes} disabled={!can} onChange={(e) => setS({ ...s, minutes: n(e.target.value) })} style={{ width: 60 }} /></label>
      <label>Versions <input type="number" min={1} max={4} value={s.versions || 2} disabled={!can} onChange={(e) => setS({ ...s, versions: n(e.target.value) })} style={{ width: 45 }} /></label>
      {clos.map((c) => <label key={c}>{c} share <input type="number" value={s.cloShares[c] ?? 0} disabled={!can} onChange={(e) => setS({ ...s, cloShares: { ...s.cloShares, [c]: n(e.target.value) } })} style={{ width: 45 }} /></label>)}
      {(["EASY", "MEDIUM", "HARD"] as const).map((d) => <label key={d}>{d.toLowerCase()} <input type="number" value={s.difficulty?.[d] ?? 0} disabled={!can} onChange={(e) => setS({ ...s, difficulty: { ...s.difficulty, [d]: n(e.target.value) } })} style={{ width: 40 }} /></label>)}
    </div>
    <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
      <button type="button" className="btn btn-sm btn-secondary" onClick={async () => { const r = await post({ action: "check", code, examType, spec: s }); setM(r.error || (r.ok ? `✓ The bank (${r.bank} reviewed questions) can build every version.` : `Not enough yet: ${r.gaps.join("; ")}`)); }}>Check the bank</button>
      {can && <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "propose", code, examType, spec: s }); setM(r.error || "Proposed ✓ — sent to the Program Lead"); if (!r.error) setTimeout(() => location.reload(), 800); }}>Propose</button>}
    </div>
    {m && <p className="small-note" role="status" style={{ margin: "4px 0 0" }}>{m}</p>}
  </div>;
}
export function Act({ body, label, confirm: c }: { body: Record<string, unknown>; label: string; confirm?: string }) {
  const [m, setM] = useState("");
  return <span><button type="button" className="btn btn-sm" onClick={async () => { if (c && !window.confirm(c)) return; const r = await post(body); setM(r.error || "Done ✓"); if (!r.error) setTimeout(() => location.reload(), 700); }}>{label}</button> <span className="small-note">{m}</span></span>;
}
export function PolicyPick({ examType, value, options }: { examType: string; value: string; options: Record<string, string> }) {
  const [v, setV] = useState(value); const [m, setM] = useState("");
  return <label style={{ fontSize: 12.5, display: "block" }}>{examType}: <select value={v} onChange={async (e) => { setV(e.target.value); const r = await post({ action: "policy", examType, policy: e.target.value }); setM(r.error || "✓"); }}>{Object.entries(options).map(([k, t]) => <option key={k} value={k}>{k} — {t}</option>)}</select> <span className="small-note">{m}</span></label>;
}
export function ErrorNote({ genId, note }: { genId: string; note: string | null }) {
  const [v, setV] = useState(note || ""); const [m, setM] = useState("");
  return <span style={{ fontSize: 12 }}><input value={v} onChange={(e) => setV(e.target.value)} placeholder="Error found in the hall: what was done" style={{ width: 230 }} /> <button type="button" className="btn-link" onClick={async () => { const r = await post({ action: "error", genId, note: v }); setM(r.error || "✓"); }}>save</button> <span className="small-note">{m}</span></span>;
}
