"use client";

import { useState } from "react";

type R = { bySem: Record<string, string[]>; ch: Record<string, number>; unfit: { code: string; why: string }[]; graduation: number | null; warnings: string[]; current: number; batchEnd: number; moved?: number };
// Advisor: load per coming semester and "Suggest plan" (Adeel prompt §21.3–4). Preview first, then save as a plan version.
export default function SuggestPlanPanel({ studentId, probation }: { studentId: string; probation: boolean }) {
  const [min, setMin] = useState(probation ? 9 : 15);
  const [max, setMax] = useState(probation ? 12 : 18);
  const [excl, setExcl] = useState("");
  const [r, setR] = useState<R | null>(null);
  const [msg, setMsg] = useState("");
  async function run(apply: boolean) {
    setMsg("");
    const d = await fetch(`/api/advisor/students/${studentId}/suggest-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ min, max, excluded: excl.split(/[ ,]+/).filter(Boolean).map(Number), apply }) }).then((x) => x.json()).catch(() => ({ error: "Could not work it out." }));
    if (d.error) return setMsg(d.error);
    setR(d);
    if (apply) { setMsg(`Saved — ${d.moved} course(s) moved. The student is told.`); setTimeout(() => location.reload(), 1200); }
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Suggest plan</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
        <label>Load per semester <input type="number" value={min} min={0} max={24} onChange={(e) => setMin(Number(e.target.value))} style={{ width: 52 }} /> – <input type="number" value={max} min={1} max={24} onChange={(e) => setMax(Number(e.target.value))} style={{ width: 52 }} /> CH</label>
        <label title="Semesters the student takes off">Skip semesters <input value={excl} onChange={(e) => setExcl(e.target.value)} placeholder="e.g. 6" style={{ width: 60 }} /></label>
        <button type="button" className="btn btn-sm" onClick={() => run(false)}>Suggest plan</button>
        {probation && <span className="small-note">On probation — lower load suggested.</span>}
      </div>
      {msg && <p style={{ fontSize: 13 }}>{msg}</p>}
      {r && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <table className="table" style={{ fontSize: 12.5 }}><tbody>
            {Object.keys(r.bySem).map(Number).sort((a, b) => a - b).map((s) => <tr key={s}><td><b>Semester {s}</b></td><td>{r.bySem[s].join(", ")}</td><td style={{ whiteSpace: "nowrap" }}>{r.ch[s]} CH</td></tr>)}
          </tbody></table>
          {r.unfit.length > 0 && <p style={{ color: "#B3261E" }}>Can&apos;t fit: {r.unfit.map((u) => `${u.code} (${u.why})`).join("; ")}</p>}
          {r.warnings.map((w, i) => <div key={i} className="small-note">⚠ {w}</div>)}
          <p>Expected to finish in <b>semester {r.graduation ?? "—"}</b>{r.graduation && r.graduation > r.batchEnd ? ` — ${r.graduation - r.batchEnd} semester(s) after the batch` : ""}.</p>
          <button type="button" className="btn btn-brass btn-sm" onClick={() => run(true)}>Save as the degree plan</button> <span className="small-note">Adjust by dragging in the board below afterwards; every change is kept in the plan history.</span>
        </div>
      )}
    </div>
  );
}
