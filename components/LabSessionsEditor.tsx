"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Level = { label: string; points: number; descriptor: string };
type Criterion = { id: string; title: string; cloId: string | null; weight: number; levels: Level[] };
type Session = { labNumber: number; title: string; cloId: string | null; criteria: Criterion[] | null; maxScore: number };

// Each lab session: the CLO it measures and an optional rubric (each criterion may carry its own CLO).
export default function LabSessionsEditor({ labCourseId, sessions, clos, template }: { labCourseId: string; sessions: Session[]; clos: { id: string; code: string }[]; template: Criterion[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Session | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const code = (id: string | null) => clos.find((c) => c.id === id)?.code || "—";
  async function save(s: Session) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/lab/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labCourseId, labNumber: s.labNumber, title: s.title, cloId: s.cloId, criteria: s.criteria }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Could not save."); return; }
    setEdit(null); router.refresh();
  }
  const next = Math.max(0, ...sessions.map((s) => s.labNumber)) + 1;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Lab sessions — CLO and rubric</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Give each lab the CLO it measures. With a rubric, each criterion can measure its own CLO (e.g. procedure → CLO-2, viva → CLO-5). When the lab is imported into the theory course, its marks are split by CLO automatically.</p>
      {msg && <div className="err">{msg}</div>}
      <table><thead><tr><th>Lab</th><th>Title</th><th>CLO</th><th>Rubric</th><th></th></tr></thead>
        <tbody>{sessions.map((s) => (
          <tr key={s.labNumber}>
            <td>{s.labNumber}</td><td>{s.title}</td>
            <td>{s.criteria ? Array.from(new Set(s.criteria.map((c) => code(c.cloId)))).join(", ") : code(s.cloId)}</td>
            <td>{s.criteria ? `${s.criteria.length} criteria` : "—"}</td>
            <td style={{ whiteSpace: "nowrap" }}><button className="act" onClick={() => setEdit({ ...s })}>Edit</button>{s.criteria && <a className="act" href={`/lab-engineer/labs/${labCourseId}/evaluate/${s.labNumber}`} style={{ marginLeft: 6 }}>Evaluate (groups) →</a>}</td>
          </tr>))}</tbody></table>
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setEdit({ labNumber: next, title: `Lab ${next}`, cloId: null, criteria: null, maxScore: 10 })}>+ Lab session</button>
      {edit && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
          <b>Lab {edit.labNumber}</b>{" "}
          <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} style={{ width: 260 }} />{" "}
          CLO <select value={edit.cloId || ""} onChange={(e) => setEdit({ ...edit, cloId: e.target.value || null })}><option value="">—</option>{clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
          <div style={{ marginTop: 8 }}>
            {!edit.criteria ? <button className="act" onClick={() => setEdit({ ...edit, criteria: template.map((c) => ({ ...c, cloId: edit.cloId })) })}>Add a rubric (lab template)</button> : (
              <>
                {edit.criteria.map((c, i) => (
                  <div key={c.id} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 12.5 }}>
                    <input value={c.title} onChange={(e) => setEdit({ ...edit, criteria: edit.criteria!.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} style={{ flex: 1 }} />
                    <input type="number" value={c.weight} onChange={(e) => setEdit({ ...edit, criteria: edit.criteria!.map((x, k) => (k === i ? { ...x, weight: Number(e.target.value) } : x)) })} style={{ width: 60 }} />%
                    <select value={c.cloId || ""} onChange={(e) => setEdit({ ...edit, criteria: edit.criteria!.map((x, k) => (k === i ? { ...x, cloId: e.target.value || null } : x)) })}><option value="">CLO…</option>{clos.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</select>
                    <button className="act act-danger" onClick={() => setEdit({ ...edit, criteria: edit.criteria!.filter((_, k) => k !== i) })}>✕</button>
                  </div>))}
                <span style={{ fontSize: 12, color: Math.abs(edit.criteria.reduce((s, c) => s + c.weight, 0) - 100) > 0.5 ? "#B3261E" : "var(--slate)" }}>Weights total {edit.criteria.reduce((s, c) => s + c.weight, 0)}% (must be 100)</span>{" "}
                <button className="act" onClick={() => setEdit({ ...edit, criteria: [...edit.criteria!, { id: `c${Date.now()}`, title: "New criterion", cloId: edit.cloId, weight: 0, levels: template[0]?.levels || [] }] })}>+ Criterion</button>{" "}
                <button className="act act-danger" onClick={() => setEdit({ ...edit, criteria: null })}>Remove rubric</button>
              </>
            )}
          </div>
          <div style={{ marginTop: 8 }}><button className="btn btn-sm" disabled={busy} onClick={() => save(edit)}>Save</button> <button className="btn btn-secondary btn-sm" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
