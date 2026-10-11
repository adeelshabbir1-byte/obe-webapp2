"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Level = { label: string; points: number; descriptor: string };
type Criterion = { id: string; title: string; cloId: string | null; weight: number; levels: Level[] };
type Clo = { id: string; code: string; statement: string };
type Student = { id: string; name: string; roll: string; mark: number | null; levels: Record<string, number>; comment: string };

const newId = () => Math.random().toString(36).slice(2, 10);
const top = (c: Criterion) => Math.max(1e-9, ...c.levels.map((l) => l.points));
function scoreFor(criteria: Criterion[], levels: Record<string, number>, maxScore: number) {
  let pct = 0;
  for (const c of criteria) { const i = levels[c.id]; if (i === undefined || !c.levels[i]) return null; pct += (c.levels[i].points / top(c)) * c.weight; }
  return Math.round((pct / 100) * maxScore * 100) / 100;
}

export default function RubricWorkspace({ courseId, courseLabel, instrument, saved, title: title0, criteria: crit0, clos, linkedClos, locked, students: st0 }: {
  courseId: string; courseLabel: string; instrument: { id: string; label: string; type: string; maxScore: number; marksPct: number };
  saved: boolean; title: string; criteria: Criterion[]; clos: Clo[]; linkedClos: string[]; locked: boolean; students: Student[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"edit" | "mark" | "clo">(saved ? "mark" : "edit");
  const [title, setTitle] = useState(title0);
  const [criteria, setCriteria] = useState<Criterion[]>(crit0);
  const [students, setStudents] = useState<Student[]>(st0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSaved, setIsSaved] = useState(saved);
  const total = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const cloCode = (id: string | null) => clos.find((c) => c.id === id)?.code || "—";
  const base = `/api/instructor/courses/${courseId}/rubrics/${instrument.id}`;

  const upd = (id: string, f: (c: Criterion) => Criterion) => setCriteria((cs) => cs.map((c) => (c.id === id ? f(c) : c)));
  async function save() {
    setBusy("save"); setMsg(null);
    const r = await fetch(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, criteria }) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setMsg({ ok: false, text: d.error || "Could not save." }); return; }
    setIsSaved(true); setMsg({ ok: true, text: `Rubric saved${d.remarked ? ` — ${d.remarked} student mark(s) worked out again` : ""}.` }); router.refresh();
  }
  async function mark(s: Student, levels: Record<string, number>, comment = s.comment) {
    setStudents((xs) => xs.map((x) => (x.id === s.id ? { ...x, levels, comment, mark: scoreFor(criteria, levels, instrument.maxScore) ?? x.mark } : x)));
    setBusy(s.id); setMsg(null);
    const r = await fetch(`${base}/scores`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: s.id, levels, comment }) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) setMsg({ ok: false, text: d.error || "Could not save the marking." });
  }

  // CLO attainment from the rubric: share of fully marked students reaching at least half of a criterion's top level.
  const attainment = useMemo(() => {
    const done = students.filter((s) => criteria.every((c) => s.levels[c.id] !== undefined));
    const per = criteria.map((c) => {
      const ok = done.filter((s) => c.levels[s.levels[c.id]] && c.levels[s.levels[c.id]].points / top(c) >= 0.5).length;
      const dist = c.levels.map((_, i) => done.filter((s) => s.levels[c.id] === i).length);
      return { c, ok, n: done.length, pct: done.length ? Math.round((100 * ok) / done.length) : 0, dist };
    });
    const byClo = new Map<string, { w: number; got: number }>();
    for (const p of per) {
      if (!p.c.cloId || !p.n) continue;
      const e = byClo.get(p.c.cloId) || { w: 0, got: 0 };
      e.w += p.c.weight; e.got += (p.pct / 100) * p.c.weight; byClo.set(p.c.cloId, e);
    }
    return { done: done.length, per, clo: Array.from(byClo.entries()).map(([id, e]) => ({ id, pct: Math.round((100 * e.got) / e.w) })) };
  }, [students, criteria]);

  const tabBtn = (k: typeof tab, t: string) => <button className={`btn ${tab === k ? "btn-brass" : ""}`} style={{ fontSize: 12.5 }} onClick={() => setTab(k)}>{t}</button>;

  return (
    <div>
      <div className="card no-print" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div><b style={{ fontSize: 15 }}>{instrument.label}</b> <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{instrument.type} · out of {instrument.maxScore} · {instrument.marksPct}% of the course</span></div>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {tabBtn("edit", "1. Rubric")}{isSaved && tabBtn("mark", "2. Mark students")}{isSaved && tabBtn("clo", "3. CLO attainment")}
          {isSaved && <button className="btn" style={{ fontSize: 12.5 }} onClick={() => window.print()}>Print rubric</button>}
        </span>
      </div>
      {msg && <p className={msg.ok ? "" : "err"} style={msg.ok ? { background: "#E8F3EC", color: "#1F5E36", padding: "8px 12px", fontSize: 13 } : undefined}>{msg.text}</p>}
      {locked && <p style={{ background: "#FBEED2", color: "#7A5208", padding: "8px 12px", fontSize: 13 }}>This course&apos;s result is submitted or approved, so marks are locked. The rubric can still be read and printed.</p>}

      {/* Printable rubric (also what the editor shows read-only when printing) */}
      <div className="print-only">
        <h2 style={{ fontSize: 16 }}>{courseLabel} — {title}</h2>
        <p style={{ fontSize: 12 }}>{instrument.label} ({instrument.type}), out of {instrument.maxScore}</p>
        <table style={{ fontSize: 11 }}>
          <thead><tr><th>Criterion (weight, CLO)</th>{criteria[0]?.levels.map((l, i) => <th key={i}>{l.label}</th>)}</tr></thead>
          <tbody>{criteria.map((c) => <tr key={c.id}><td><b>{c.title}</b><br />{c.weight}% · {cloCode(c.cloId)}</td>{c.levels.map((l, i) => <td key={i}><b>{l.points}</b> {l.descriptor}</td>)}</tr>)}</tbody>
        </table>
      </div>

      {tab === "edit" && (
        <div className="card no-print">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: "1 1 300px", fontWeight: 600 }} />
            <span style={{ fontSize: 13, color: Math.abs(total - 100) > 0.01 ? "var(--rust)" : "var(--sage)", fontWeight: 700 }}>Weights total {Math.round(total * 100) / 100}%{Math.abs(total - 100) > 0.01 ? " — must be 100%" : " ✓"}</span>
            <button className="btn btn-brass" disabled={busy === "save" || Math.abs(total - 100) > 0.01} onClick={save}>{busy === "save" ? "Saving…" : isSaved ? "Save changes" : "Save rubric"}</button>
          </div>
          {!isSaved && <p style={{ fontSize: 12.5, color: "var(--slate)", margin: "0 0 10px" }}>A starting rubric for a {instrument.type.toLowerCase()} is filled in{linkedClos.length ? ", with the CLOs this item is linked to in your lecture plan" : ""}. Change anything, then save.</p>}
          {criteria.map((c, ci) => (
            <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <b style={{ fontSize: 12, color: "var(--slate)" }}>{ci + 1}.</b>
                <input value={c.title} onChange={(e) => upd(c.id, (x) => ({ ...x, title: e.target.value }))} placeholder="Criterion" style={{ flex: "1 1 260px" }} />
                <label style={{ fontSize: 12 }}>Weight % <input type="number" min={1} max={100} value={c.weight} onChange={(e) => upd(c.id, (x) => ({ ...x, weight: Number(e.target.value) }))} style={{ width: 70 }} /></label>
                <label style={{ fontSize: 12 }}>CLO <select value={c.cloId || ""} onChange={(e) => upd(c.id, (x) => ({ ...x, cloId: e.target.value || null }))}>
                  <option value="">— none —</option>{clos.map((o) => <option key={o.id} value={o.id}>{o.code}{linkedClos.includes(o.id) ? " ★" : ""}</option>)}
                </select></label>
                <button className="act act-danger" onClick={() => setCriteria((cs) => cs.filter((x) => x.id !== c.id))} disabled={criteria.length <= 1}>Remove</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${c.levels.length}, minmax(140px, 1fr))`, gap: 6, overflowX: "auto" }}>
                {c.levels.map((l, li) => (
                  <div key={li} style={{ background: "#FAF7F6", borderRadius: 8, padding: 6 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input value={l.label} onChange={(e) => upd(c.id, (x) => ({ ...x, levels: x.levels.map((y, k) => (k === li ? { ...y, label: e.target.value } : y)) }))} style={{ flex: 1, fontSize: 12, fontWeight: 600 }} />
                      <input type="number" min={0} value={l.points} title="points" onChange={(e) => upd(c.id, (x) => ({ ...x, levels: x.levels.map((y, k) => (k === li ? { ...y, points: Number(e.target.value) } : y)) }))} style={{ width: 48, fontSize: 12 }} />
                    </div>
                    <textarea value={l.descriptor} rows={3} placeholder="What this level looks like" onChange={(e) => upd(c.id, (x) => ({ ...x, levels: x.levels.map((y, k) => (k === li ? { ...y, descriptor: e.target.value } : y)) }))} style={{ width: "100%", fontSize: 11.5, marginTop: 4 }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button className="btn" onClick={() => setCriteria((cs) => [...cs, { id: newId(), title: "", cloId: null, weight: 0, levels: (cs[0]?.levels || []).map((l) => ({ ...l, descriptor: "" })) }])}>+ Add criterion</button>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>★ = a CLO this item is linked to in your lecture plan. A student&apos;s mark = sum of (points of the chosen level ÷ top points) × criterion weight, scaled to {instrument.maxScore}. A criterion counts as attained at half of its top points or more.</p>
        </div>
      )}

      {tab === "mark" && (
        <div className="card no-print" style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Student</th>{criteria.map((c) => <th key={c.id} title={`${c.weight}% · ${cloCode(c.cloId)}`}>{c.title}<div style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{c.weight}% · {cloCode(c.cloId)}</div></th>)}<th style={{ textAlign: "center" }}>Mark /{instrument.maxScore}</th><th>Comment</th></tr></thead>
            <tbody>{students.map((s) => {
              const m = scoreFor(criteria, s.levels, instrument.maxScore);
              return (
                <tr key={s.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{s.roll}<div style={{ fontSize: 11, color: "var(--slate)" }}>{s.name}</div></td>
                  {criteria.map((c) => (
                    <td key={c.id}>
                      <select disabled={locked || busy === s.id} value={s.levels[c.id] ?? ""} onChange={(e) => { const v = e.target.value; const lv = { ...s.levels }; if (v === "") delete lv[c.id]; else lv[c.id] = Number(v); mark(s, lv); }} style={{ fontSize: 12, maxWidth: 170 }}>
                        <option value="">—</option>{c.levels.map((l, i) => <option key={i} value={i} title={l.descriptor}>{l.label} ({l.points})</option>)}
                      </select>
                    </td>
                  ))}
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{m ?? (s.mark !== null ? <span style={{ color: "var(--slate)", fontWeight: 400 }} title="Entered on Marks Entry, not with the rubric">{s.mark}</span> : "—")}</td>
                  <td><input defaultValue={s.comment} disabled={locked} placeholder="Feedback" onBlur={(e) => e.target.value !== s.comment && mark(s, s.levels, e.target.value)} style={{ fontSize: 12, minWidth: 160 }} /></td>
                </tr>
              );
            })}</tbody>
          </table>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>Each choice saves at once. When every criterion of a student has a level, the mark goes into Marks Entry automatically.</p>
        </div>
      )}

      {tab === "clo" && (
        <div className="card no-print" style={{ overflowX: "auto" }}>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>{attainment.done} of {students.length} students fully marked.</p>
          {attainment.clo.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {attainment.clo.map((x) => <div key={x.id} className="stat" style={{ minWidth: 150 }}><div style={{ fontSize: 22, fontWeight: 700, color: x.pct < 60 ? "var(--rust)" : "var(--sage)" }}>{x.pct}%</div><div style={{ fontSize: 12, color: "var(--slate)" }}>{cloCode(x.id)} attained (weighted by criteria)</div></div>)}
            </div>
          )}
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Criterion</th><th>CLO</th>{criteria[0]?.levels.map((l, i) => <th key={i} style={{ textAlign: "center" }}>{l.label}</th>)}<th style={{ textAlign: "center" }}>Attained</th></tr></thead>
            <tbody>{attainment.per.map((p) => (
              <tr key={p.c.id}><td>{p.c.title}</td><td>{cloCode(p.c.cloId)}</td>{p.dist.map((n, i) => <td key={i} style={{ textAlign: "center" }}>{n}</td>)}<td style={{ textAlign: "center", fontWeight: 700, color: p.pct < 60 ? "var(--rust)" : "var(--sage)" }}>{p.n ? `${p.pct}%` : "—"}</td></tr>
            ))}</tbody>
          </table>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>Attained = students whose level is at least half of the criterion&apos;s top points. Below 60% is shown in red.</p>
        </div>
      )}
    </div>
  );
}
