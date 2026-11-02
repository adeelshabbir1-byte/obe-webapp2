"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Lec = { n: number; topic: string; clo: string | null };
type Asmt = { id: string; type: string; label: string; maxScore: number; marksPct: number; lectures: Lec[]; papers: { id: string; status: string; variant: string }[] };
type Ga = { ga: string; pct: number; clos: string[]; assessed: number };
type Cqi = { id: string; sourceReference: string | null; finding: string; actionTaken: string | null; status: string; metricBefore: number | null; metricAfter: number | null };
type Board = { course: { id: string; code: string; title: string }; term: string; forAll: boolean; assessments: Asmt[]; ga: { standing: Ga[]; weak: Ga[]; target: number }; cqi: Cqi[]; short: { label: string; gaps: string[] } | null };
type Q = { id: string; text: string; marks: number; clo: string; bloom: string; difficulty: string; measured: string | null; lecture: number | null; topic: string };
type View = { id: string; status: string; variant: string; examType: string; label: string; check: { ok?: boolean; fails?: string[]; notes?: string[]; cloPct?: Record<string, number>; gaps?: string[]; total?: number }; questions: Q[]; versions: { id: string; variant: string; status: string }[] };
type Swap = { fromId: string; toId: string; fromClo: string; toClo: string; fromTopic: string; toTopic: string; marks: number; difficulty: string };

const API = "/api/plan-generate";
async function post(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Failed");
  return d;
}
const lower = (s: string) => s.toLowerCase();

export default function PlanGenerateApp({ courseId }: { courseId: string }) {
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [paper, setPaper] = useState<View | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`${API}?courseId=${encodeURIComponent(courseId)}`); const d = await r.json().catch(() => ({}));
    if (!r.ok) setErr(d.error || "Could not load."); else setB(d);
  }, [courseId]);
  useEffect(() => { load(); }, [load]);
  const show = async (id: string) => { const r = await fetch(`${API}?paper=${id}`); const d = await r.json().catch(() => ({})); if (r.ok) setPaper(d); else setMsg({ ok: false, text: d.error || "Could not open." }); };
  const run = async (body: Record<string, unknown>, ok: (d: Record<string, any>) => string) => {
    setMsg(null);
    try { const d = await post(body); setMsg({ ok: true, text: ok(d) }); await load(); return d; } catch (e) { setMsg({ ok: false, text: (e as Error).message }); return null; }
  };

  if (err) return <div className="err">{err}</div>;
  if (!b) return <p className="small-note">Loading…</p>;
  const openGa = b.cqi.filter((c) => ["open", "in-progress"].includes(c.status));
  return (
    <div>
      <p className="small-note"><Link href={`/question-bank?courseId=${courseId}`}>← Question bank</Link></p>
      <h1>Generate from the plan — {b.course.code} {b.course.title}</h1>
      <p className="small-note">{b.term}. Each assessment opens with its lectures (topics), CLOs and marks from the plan. Questions used recently rest: a final&apos;s for 3 terms, a mid&apos;s for 2, a quiz&apos;s or assignment&apos;s for 1. Questions released for student practice are never used.</p>
      {msg && <div className={msg.ok ? "ok" : "err"} role="status" data-msg>{msg.text}</div>}
      {b.short && <div className="card" style={{ background: "#FFF8E1" }} data-short><b>Question bank short for {b.short.label}:</b> {b.short.gaps.join("; ")}. The Subject Expert has this as a task.</div>}

      <GaCard b={b} courseId={courseId} run={run} />

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Assessments in the plan</h3>
        <table style={{ fontSize: 13 }}><thead><tr><th>Assessment</th><th>Marks</th><th>Lectures</th><th>CLOs</th><th>Generated</th><th /></tr></thead>
          <tbody>{b.assessments.map((a) => (
            <tr key={a.id} data-asmt={a.id}>
              <td><b>{a.label}</b> <span className="small-note">{a.type}</span></td><td>{a.maxScore}</td>
              <td>{a.lectures.length ? a.lectures.map((l) => `L${l.n}`).join(", ") : <span className="small-note">no lectures linked</span>}</td>
              <td>{Array.from(new Set(a.lectures.map((l) => l.clo).filter(Boolean))).join(", ") || "—"}</td>
              <td>{a.papers.map((p) => <button key={p.id} className="btn btn-secondary btn-sm" onClick={() => show(p.id)} style={{ marginRight: 4 }}>{p.variant}{p.status === "ADOPTED" ? " ✓" : ""}</button>)}</td>
              <td><button className="btn btn-sm" disabled={!a.lectures.length} onClick={() => setOpen(open === a.id ? null : a.id)} data-generate={a.id}>Generate</button></td>
            </tr>))}</tbody></table>
        {b.assessments.length === 0 && <p className="small-note">The plan has no assessments yet. The Subject Expert sets them in the course plan.</p>}
      </div>
      {open && <GenForm a={b.assessments.find((x) => x.id === open)!} forAll={b.forAll} onDone={async (id) => { setOpen(null); await load(); await show(id); }} run={run} courseId={courseId} />}
      {paper && <PaperView p={paper} weak={b.ga.weak.map((g) => g.ga)} openGa={openGa.map((c) => c.sourceReference || "")} run={run} reload={() => show(paper.id)} onOpen={show} />}
    </div>
  );
}

function GaCard({ b, courseId, run }: { b: Board; courseId: string; run: (body: Record<string, unknown>, ok: (d: Record<string, any>) => string) => Promise<unknown> }) {
  const [note, setNote] = useState<Record<string, string>>({});
  if (!b.ga.standing.length) return <div className="card"><h3 style={{ marginTop: 0 }}>Graduate attributes in this course</h3><p className="small-note">No GA results yet: CLOs need marks and a GA mapping.</p></div>;
  return (
    <div className="card" data-ga>
      <h3 style={{ marginTop: 0 }}>Graduate attributes in this course</h3>
      <p className="small-note">Class average per GA, from its CLOs. Below {b.ga.target}% is weak: hold a tutorial, record it here, then rebalance the next paper toward that GA (same difficulty, marks and length; it counts for the grade).</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{b.ga.standing.map((g) => <span key={g.ga} style={{ padding: "4px 10px", borderRadius: 999, background: g.assessed && g.pct < b.ga.target ? "#FBE4E2" : "#E3F2E8", fontSize: 13 }}>{g.ga} {g.assessed ? `${g.pct}%` : "not assessed"} <span className="small-note">({g.clos.join(", ")})</span></span>)}</div>
      {b.ga.weak.map((g) => {
        const rec = b.cqi.find((c) => c.sourceReference === g.ga && ["open", "in-progress"].includes(c.status));
        return (
          <div key={g.ga} style={{ marginTop: 10, padding: 8, background: "#FFF8E1", borderRadius: 6 }} data-weak={g.ga}>
            <b>{g.ga} is weak ({g.pct}%)</b> — its CLOs: {g.clos.join(", ")}.{" "}
            {rec ? <span>Tutorial recorded. Generate or open a paper below and use <b>Rebalance toward {g.ga}</b>.</span> : <>
              <input placeholder="Tutorial: what was done, when" value={note[g.ga] || ""} onChange={(e) => setNote({ ...note, [g.ga]: e.target.value })} style={{ minWidth: 260 }} />
              <button className="btn btn-sm" onClick={() => run({ action: "tutorial", courseId, ga: g.ga, note: note[g.ga] || "" }, (d) => `Tutorial recorded as a CQI action (${g.ga} at ${d.before}%).`)} data-tutorial={g.ga}>Record tutorial</button></>}
          </div>
        );
      })}
      {b.cqi.length > 0 && (
        <table style={{ fontSize: 12.5, marginTop: 10 }}><thead><tr><th>GA</th><th>Action</th><th>Before</th><th>After</th><th>Result</th><th /></tr></thead>
          <tbody>{b.cqi.map((c) => <tr key={c.id} data-cqi={c.id}><td>{c.sourceReference}</td><td style={{ whiteSpace: "pre-wrap", maxWidth: 420 }}>{c.actionTaken}</td><td>{c.metricBefore ?? "—"}%</td><td>{c.metricAfter != null ? `${c.metricAfter}%` : "—"}</td>
            <td>{c.status === "verified-effective" ? "Effective" : c.status === "verified-ineffective" ? "Not effective" : "Open"}</td>
            <td><button className="btn btn-secondary btn-sm" onClick={() => run({ action: "recheck", courseId, cqiId: c.id }, (d) => `${c.sourceReference}: ${d.before}% → ${d.after}% — ${d.effective ? "effective" : "not effective"}.`)}>Re-check now</button></td></tr>)}</tbody></table>
      )}
    </div>
  );
}

function GenForm({ a, forAll, courseId, run, onDone }: { a: Asmt; forAll: boolean; courseId: string; run: (body: Record<string, unknown>, ok: (d: Record<string, any>) => string) => Promise<any>; onDone: (id: string) => void }) {
  const [pick, setPick] = useState<Set<number>>(new Set(a.lectures.map((l) => l.n)));
  const [mix, setMix] = useState({ EASY: 30, MEDIUM: 50, HARD: 20 });
  const [all, setAll] = useState(false);
  const [examDate, setExamDate] = useState("");
  return (
    <div className="card" data-genform>
      <h3 style={{ marginTop: 0 }}>Generate {a.label} ({a.maxScore} marks)</h3>
      <p className="small-note">Untick a lecture to leave its topic out.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 4, fontSize: 13 }}>
        {a.lectures.map((l) => <label key={l.n}><input type="checkbox" checked={pick.has(l.n)} onChange={(e) => { const n = new Set(pick); if (e.target.checked) n.add(l.n); else n.delete(l.n); setPick(n); }} /> L{l.n} {l.topic} <span className="small-note">{l.clo || ""}</span></label>)}
      </div>
      <p style={{ fontSize: 13 }}>Difficulty mix: {(["EASY", "MEDIUM", "HARD"] as const).map((k) => <label key={k} style={{ marginRight: 10 }}>{lower(k)} <input type="number" min={0} max={100} value={mix[k]} onChange={(e) => setMix({ ...mix, [k]: Number(e.target.value) })} style={{ width: 60 }} />%</label>)}</p>
      {/mid|final/i.test(a.type) && <p style={{ fontSize: 13 }}>Exam date (only topics taught before it): <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></p>}
      {forAll && <label style={{ fontSize: 13, display: "block", marginBottom: 8 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> For all sections (equivalent versions B, C …)</label>}
      <button className="btn" onClick={async () => { const d = await run({ action: "generate", courseId, instrumentId: a.id, lectures: Array.from(pick), difficulty: mix, examDate: examDate || null, allSections: all }, (d) => `${d.label}: ${d.chosen.length} question(s)${d.versions?.length ? `, versions ${d.versions.join(", ")}` : ""}${d.gaps.length ? ` — the bank is short: ${d.gaps.join("; ")}` : ""}.`); if (d) onDone(d.id); }} data-run>Generate</button>
    </div>
  );
}

function PaperView({ p, weak, openGa, run, reload, onOpen }: { p: View; weak: string[]; openGa: string[]; run: (body: Record<string, unknown>, ok: (d: Record<string, any>) => string) => Promise<any>; reload: () => void; onOpen: (id: string) => void }) {
  const [ga, setGa] = useState(weak[0] || "");
  const [count, setCount] = useState(1);
  const [plan, setPlan] = useState<{ swaps: Swap[]; needsOmc: Swap[]; none: string[] } | null>(null);
  const draft = p.status === "DRAFT";
  const chk = p.check || {};
  const idx = (id: string) => p.questions.findIndex((q) => q.id === id) + 1;
  return (
    <div className="card" data-paper={p.id}>
      <h3 style={{ marginTop: 0 }}>{p.label} — version {p.variant} {p.status === "ADOPTED" ? "✓ adopted" : "(draft)"}</h3>
      {p.versions.length > 1 && <p style={{ fontSize: 13 }}>Versions: {p.versions.map((v) => <button key={v.id} className="btn btn-secondary btn-sm" onClick={() => onOpen(v.id)} style={{ marginRight: 4, fontWeight: v.id === p.id ? 700 : 400 }}>{v.variant}{v.status === "ADOPTED" ? " ✓" : ""}</button>)}</p>}
      <p style={{ fontSize: 13 }}>{chk.total ?? p.questions.reduce((a, q) => a + q.marks, 0)} marks · {chk.cloPct ? Object.entries(chk.cloPct).map(([c, v]) => `${c} ${v}%`).join(" · ") : ""}{/quiz/i.test(p.examType) ? " · online: options shuffled per student" : ""}</p>
      {(chk.fails || []).length > 0 && <div className="err">{(chk.fails || []).join(" ")}</div>}
      <table style={{ fontSize: 13 }}><thead><tr><th>#</th><th>Question</th><th>Marks</th><th>CLO</th><th>Bloom</th><th>Difficulty (planned / results)</th><th>Topic</th><th /></tr></thead>
        <tbody>{p.questions.map((q, i) => (
          <tr key={q.id} data-q={q.id}><td>Q{i + 1}</td><td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{q.text}</td><td>{q.marks}</td><td>{q.clo}</td><td>{q.bloom}</td>
            <td>{lower(q.difficulty)}{q.measured ? ` / ${lower(q.measured)}` : " / —"}</td><td>{q.lecture ? `L${q.lecture} ` : ""}{q.topic}</td>
            <td>{draft && <button className="btn btn-secondary btn-sm" onClick={async () => { if (await run({ action: "swap", paperId: p.id, questionId: q.id }, () => `Q${i + 1} swapped for a similar question.`)) reload(); }} data-swap={q.id}>Swap</button>}</td></tr>))}</tbody></table>
      {draft && weak.length > 0 && (
        <div style={{ marginTop: 10, padding: 8, background: "#F7F6F1", borderRadius: 6 }} data-rebalance>
          <b>Rebalance toward</b> <select value={ga} onChange={(e) => { setGa(e.target.value); setPlan(null); }}>{weak.map((g) => <option key={g}>{g}</option>)}</select> — up to <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 50 }} /> question(s).
          <span className="small-note"> Same marks and difficulty; questions move from the strongest GA&apos;s topics to {ga}&apos;s taught topics.</span>{" "}
          {!openGa.includes(ga) ? <span className="small-note" style={{ color: "#B3261E" }}>Record the tutorial for {ga} above first.</span> : <>
            <button className="btn btn-secondary btn-sm" onClick={async () => { const d = await run({ action: "rebalance", paperId: p.id, ga, count, apply: false }, (d) => `${d.swaps.length} swap(s) within the OMC limits${d.needsOmc.length ? `, ${d.needsOmc.length} would need the OMC` : ""}.`); if (d) setPlan(d); }} data-suggest>Suggest swaps</button>
            {plan && (plan.swaps.length + plan.needsOmc.length > 0) && <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={async () => { const d = await run({ action: "rebalance", paperId: p.id, ga, count, apply: true }, (d) => `${d.lines?.length || 0} question(s) moved toward ${ga} and logged on the CQI record${d.needsOmc.length ? `; ${d.needsOmc.length} sent to the OMC as a request` : ""}.`); if (d) { setPlan(null); reload(); } }} data-apply>Apply</button>}</>}
          {plan && <ul style={{ fontSize: 13 }}>
            {plan.swaps.map((s) => <li key={s.fromId}>Q{idx(s.fromId)}: {s.fromTopic} ({s.fromClo}) → {s.toTopic} ({s.toClo} → {ga}) · {s.marks} marks · {lower(s.difficulty)}</li>)}
            {plan.needsOmc.map((s) => <li key={s.fromId} style={{ color: "#8a5a00" }}>Q{idx(s.fromId)}: {s.fromClo} → {s.toClo} goes beyond the OMC&apos;s CLO limits — sent to the OMC as a request when you apply.</li>)}
            {plan.none.map((t) => <li key={t} className="small-note">No {ga} question with the same marks and difficulty for {t}.</li>)}
          </ul>}
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        {draft && <button className="btn" disabled={!chk.ok} onClick={async () => { if (await run({ action: "adopt", paperId: p.id }, () => /mid|final/i.test(p.examType) ? "Adopted: the question plan and the vetting draft are ready." : "Adopted.")) reload(); }} data-adopt>Adopt</button>}
        <a className="btn btn-secondary" href={`${API}?paper=${p.id}&pdf=1`}>Download PDF</a>
      </div>
    </div>
  );
}
