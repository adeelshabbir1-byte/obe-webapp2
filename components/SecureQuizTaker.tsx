"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import MathText from "./MathText";

// A secure online quiz (Part 6, build B), level 1: full-screen; leaving full-screen, switching tab or app and the window
// losing focus are recorded with the time away; copy, paste, right-click and printing are blocked; answers are saved
// after every question; a dropped connection is resumed within the quiz time (lost time is not an event).

type Q = { id: string; type: string; text: string; marks: number; parts: { label: string; text: string; marks: number }[]; options: { i: number; text: string }[] };
type View = { runId: string; quizId: string; title: string; questions: Q[]; answers: Record<string, unknown>; deadline: number; submitted: boolean; settings: { oneAtATime: boolean; noBack: boolean; rule: string; autoAfter: number; level: number }; events: number; pos: number; lostMs: number };
const API = "/api/student/secure-quiz";
async function call(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
  return d;
}

export default function SecureQuizTaker({ quizId, intro }: { quizId: string; intro: string }) {
  const [v, setV] = useState<View | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [pos, setPos] = useState(0);
  const [warn, setWarn] = useState<string | null>(null);
  const [done, setDone] = useState<{ score?: number; max?: number; pending?: number; auto?: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(Date.now());
  const away = useRef<{ kind: string; at: number } | null>(null);
  const runId = v?.runId;

  const report = useCallback(async (kind: string, awayMs: number | null = null) => {
    if (!runId || done) return;
    try {
      const d = await call({ action: "event", runId, kind, awayMs });
      if (d.submitted) { setDone({ auto: true }); exitFs(); return; }
      if (d.action === "WARN") setWarn(d.left !== null && d.left !== undefined ? `Stay in the quiz: leaving it was recorded and your teacher can see it. ${d.left} more and the quiz is submitted.` : "Stay in the quiz: leaving it was recorded and your teacher can see it.");
      if (d.action === "FLAG") setWarn("Leaving the quiz was recorded and your teacher can see it.");
    } catch { /* offline: the heartbeat catches up */ }
  }, [runId, done]);

  const begin = async () => {
    setErr(null);
    try { await document.documentElement.requestFullscreen?.(); } catch { /* not allowed: still recorded as not full-screen */ }
    try { const d = (await call({ action: "start", quizId })) as View; setV(d); setAnswers(d.answers || {}); setPos(d.pos || 0); if (d.submitted) setDone({}); }
    catch (e) { setErr((e as Error).message); exitFs(); }
  };

  // Leaving and coming back: one event per time away, with how long.
  useEffect(() => {
    if (!runId || done) return;
    const leave = (kind: string) => { if (!away.current) away.current = { kind, at: Date.now() }; };
    const back = () => { const a = away.current; if (!a) return; away.current = null; report(a.kind, Date.now() - a.at); };
    const onFs = () => { if (!document.fullscreenElement) { leave("FULLSCREEN_EXIT"); } else back(); };
    const onVis = () => { if (document.visibilityState === "hidden") leave("TAB_HIDDEN"); else if (away.current?.kind !== "FULLSCREEN_EXIT") back(); };
    const onBlur = () => setTimeout(() => { if (!document.hasFocus() && !away.current) leave("BLUR"); }, 300);
    const onFocus = () => { if (away.current && away.current.kind !== "FULLSCREEN_EXIT") back(); };
    const block = (kind: string) => (e: Event) => { e.preventDefault(); report(kind); };
    const copy = block("COPY"), cut = block("COPY"), paste = block("PASTE"), ctx = block("CONTEXT_MENU");
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ["p", "c", "v", "x", "s"].includes(e.key.toLowerCase())) { e.preventDefault(); report(e.key.toLowerCase() === "p" ? "PRINT" : e.key.toLowerCase() === "v" ? "PASTE" : "COPY"); } };
    const print = () => report("PRINT");
    document.addEventListener("fullscreenchange", onFs); document.addEventListener("visibilitychange", onVis); window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus);
    document.addEventListener("copy", copy); document.addEventListener("cut", cut); document.addEventListener("paste", paste); document.addEventListener("contextmenu", ctx); document.addEventListener("keydown", key); window.addEventListener("beforeprint", print);
    return () => {
      document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus);
      document.removeEventListener("copy", copy); document.removeEventListener("cut", cut); document.removeEventListener("paste", paste); document.removeEventListener("contextmenu", ctx); document.removeEventListener("keydown", key); window.removeEventListener("beforeprint", print);
    };
  }, [runId, done, report]);

  // The heartbeat: a dropped connection shows here; coming back resumes (the lost time is added, not counted).
  useEffect(() => {
    if (!runId || done) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      try { const d = await call({ action: "beat", runId }); setOffline(false); if (d.submitted) setDone({}); if (d.resumed) { const nv = await call({ action: "start", quizId }); setV((x) => (x ? { ...x, deadline: nv.deadline, lostMs: nv.lostMs } : x)); } else if (d.deadline) setV((x) => (x && x.deadline !== d.deadline ? { ...x, deadline: d.deadline } : x)); }
      catch { setOffline(true); }
    }, 10000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, [runId, done, quizId]);

  const save = useCallback(async (next: Record<string, unknown>, p: number) => { if (!runId) return; try { await call({ action: "save", runId, answers: next, pos: p }); setOffline(false); } catch { setOffline(true); } }, [runId]);
  const submit = useCallback(async (auto = false) => { if (!runId) return; try { await save(answers, pos); const d = await call({ action: "submit", runId }); setDone({ ...d, auto }); exitFs(); } catch (e) { setErr((e as Error).message); } }, [runId, answers, pos, save]);
  useEffect(() => { if (v && !done && now > v.deadline) submit(true); }, [now, v, done, submit]);

  if (done) return <div className="card" data-quiz-done><b>{done.auto ? "The quiz was submitted for you." : "Submitted."}</b>{done.score !== undefined && done.max ? <> Score so far: {done.score}/{done.max}{done.pending ? ` (${done.pending} answer(s) to be marked by your teacher)` : ""}.</> : null} <a href={`/student/quizzes/${quizId}`}>See your result</a></div>;
  if (!v) return <div className="card"><p style={{ whiteSpace: "pre-wrap" }}>{intro}</p>{err && <div className="err" data-quiz-err>{err}</div>}<button className="btn" onClick={begin} data-quiz-start>Start the quiz (full-screen)</button></div>;
  const left = Math.max(0, Math.round((v.deadline - now) / 1000));
  const shown = v.settings.oneAtATime ? [v.questions[pos]].filter(Boolean) : v.questions;
  const set = (id: string, val: unknown) => { const next = { ...answers, [id]: val }; setAnswers(next); save({ [id]: val }, pos); };
  return (
    <div className="no-print" style={{ userSelect: "none" }} data-quiz-run={v.runId}>
      <style>{"@media print { body { display: none !important; } }"}</style>
      <div className="card" style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b>{v.title}</b><span data-timer>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left{v.lostMs ? ` (incl. ${Math.round(v.lostMs / 60000)} min for a lost connection)` : ""}</span>
        {offline && <span style={{ color: "#B3261E" }} data-offline>Connection lost — your answers are kept; carry on, it reconnects.</span>}
      </div>
      {warn && <div className="err" role="alert" data-quiz-warn>{warn} <button className="btn btn-secondary btn-sm" onClick={() => { setWarn(null); document.documentElement.requestFullscreen?.().catch(() => null); }}>Back to full-screen</button></div>}
      {shown.map((q) => {
        const n = v.questions.indexOf(q) + 1;
        return (
          <div key={q.id} className="card" data-quiz-q={q.id}>
            <div><b>{n}.</b> <MathText text={q.text} /> <span className="small-note">[{q.marks} mark{q.marks === 1 ? "" : "s"}]</span></div>
            {q.parts.map((p) => <div key={p.label} className="small-note">({p.label}) <MathText text={p.text} /> [{p.marks}]</div>)}
            {(q.type === "MCQ" || q.type === "TRUE_FALSE") && q.options.map((o) => <label key={o.i} style={{ display: "block", margin: "4px 0" }}><input type="radio" name={q.id} checked={answers[q.id] === o.i} onChange={() => set(q.id, o.i)} data-opt={o.i} /> <MathText text={o.text} /></label>)}
            {q.type === "MCQ_MULTI" && q.options.map((o) => { const cur = (answers[q.id] as number[]) || []; return <label key={o.i} style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={cur.includes(o.i)} onChange={(e) => set(q.id, e.target.checked ? cur.concat(o.i) : cur.filter((x) => x !== o.i))} data-opt={o.i} /> <MathText text={o.text} /></label>; })}
            {q.type === "NUMERICAL" && <input inputMode="decimal" value={String(answers[q.id] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} onBlur={(e) => set(q.id, e.target.value)} data-num />}
            {!["MCQ", "TRUE_FALSE", "MCQ_MULTI", "NUMERICAL"].includes(q.type) && <textarea rows={q.type === "SHORT" ? 3 : 8} style={{ width: "100%", fontFamily: q.type === "CODE" ? "monospace" : undefined }} value={String(answers[q.id] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} onBlur={(e) => set(q.id, e.target.value)} data-text />}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
        {v.settings.oneAtATime && pos > 0 && !v.settings.noBack && <button className="btn btn-secondary" onClick={() => { setPos(pos - 1); save({}, pos - 1); }}>Back</button>}
        {v.settings.oneAtATime && pos < v.questions.length - 1 && <button className="btn" onClick={() => { setPos(pos + 1); save({}, pos + 1); }} data-next>{v.settings.noBack ? "Next (no going back)" : "Next"}</button>}
        {(!v.settings.oneAtATime || pos === v.questions.length - 1) && <button className="btn" onClick={() => { if (confirm("Submit your answers now?")) submit(false); }} data-quiz-submit>Submit</button>}
      </div>
    </div>
  );
}
function exitFs() { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => null); }
