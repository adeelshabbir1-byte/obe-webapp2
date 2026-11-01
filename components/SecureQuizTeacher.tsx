"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MathText from "./MathText";

// The teacher's side of secure quizzes (Part 6, build B): create one from the question bank (rules or by hand, every
// setting), watch it live (each student's events with their times), mark written answers, open a make-up.

const API = "/api/quiz-secure";
async function call(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
  return d;
}
const local = (d: Date) => new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 16);

export function SecureQuizForm({ courseId, clos, instruments }: { courseId: string; clos: string[]; instruments: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [f, setF] = useState<Record<string, any>>({ title: "Secure quiz", instrumentId: instruments[0]?.id || "", opensAt: local(now), closesAt: local(new Date(now.getTime() + 7 * 86400000)), durationMin: 20, attempts: 1, shuffleQuestions: true, shuffleOptions: true, oneAtATime: false, noBack: false, results: "AFTER_CLOSE", showAnswers: false, rule: "AUTO", autoAfter: 3, requireSeb: false, desktopOnly: false, aiMarking: false });
  const [rules, setRules] = useState<{ clo: string; bloom: string; difficulty: string; count: number }[]>(clos.map((c) => ({ clo: c, bloom: "", difficulty: "", count: 0 })));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  if (!open) return <button className="btn btn-sm" onClick={() => setOpen(true)} data-secure-new>New secure quiz from the question bank</button>;
  const chk = (k: string, label: string) => <label style={{ fontSize: 12 }}><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} data-s={k} /> {label}</label>;
  return (
    <div className="card" data-secure-form>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 12 }}>Title<br /><input value={f.title} onChange={(e) => set("title", e.target.value)} data-s="title" /></label>
        <label style={{ fontSize: 12 }}>Marks go to<br /><select value={f.instrumentId} onChange={(e) => set("instrumentId", e.target.value)} data-s="instrument"><option value="">— not linked —</option>{instruments.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Opens (PKT)<br /><input type="datetime-local" value={f.opensAt} onChange={(e) => set("opensAt", e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Closes (PKT)<br /><input type="datetime-local" value={f.closesAt} onChange={(e) => set("closesAt", e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Minutes<br /><input type="number" value={f.durationMin} onChange={(e) => set("durationMin", e.target.value)} style={{ width: 60 }} /></label>
        <label style={{ fontSize: 12 }}>Attempts<br /><input type="number" value={f.attempts} onChange={(e) => set("attempts", e.target.value)} style={{ width: 50 }} /></label>
        <label style={{ fontSize: 12 }}>Results<br /><select value={f.results} onChange={(e) => set("results", e.target.value)}><option value="NOW">straight away</option><option value="AFTER_CLOSE">after the quiz closes</option><option value="NEVER">never (I tell them)</option></select></label>
        <label style={{ fontSize: 12 }}>When a student leaves the quiz<br /><select value={f.rule} onChange={(e) => set("rule", e.target.value)} data-s="rule"><option value="AUTO">warn, then submit after N</option><option value="WARN">warn each time</option><option value="FLAG">flag only</option></select></label>
        {f.rule === "AUTO" && <label style={{ fontSize: 12 }}>N<br /><input type="number" value={f.autoAfter} onChange={(e) => set("autoAfter", e.target.value)} style={{ width: 50 }} /></label>}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {chk("shuffleQuestions", "Shuffle questions")}{chk("shuffleOptions", "Shuffle options")}{chk("oneAtATime", "One question at a time")}{chk("noBack", "No going back")}
        {chk("showAnswers", "Show model answers after (never for reusable questions)")}{chk("desktopOnly", "Laptop / desktop only")}{chk("requireSeb", "Require Safe Exam Browser")}{chk("aiMarking", "AI-suggested marks for written answers (off by default)")}
      </div>
      <div style={{ marginTop: 8 }}>
        <b style={{ fontSize: 12 }}>Questions drawn per student</b>
        {rules.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", fontSize: 12 }}>
            <select value={r.clo} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, clo: e.target.value } : x)))}><option value="">any CLO</option>{clos.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={r.bloom} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, bloom: e.target.value } : x)))}><option value="">any Bloom</option>{["C1", "C2", "C3", "C4", "C5", "C6"].map((b) => <option key={b}>{b}</option>)}</select>
            <select value={r.difficulty} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, difficulty: e.target.value } : x)))}><option value="">any difficulty</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select>
            <input type="number" value={r.count} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x)))} style={{ width: 55 }} data-rule-count={i} /> question(s)
          </div>))}
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 4 }} onClick={() => setRules(rules.concat({ clo: "", bloom: "", difficulty: "", count: 1 }))}>+ Rule</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" data-secure-create onClick={async () => { setMsg(null); try { const d = await call({ action: "create", courseId, ...f, rules: rules.filter((r) => r.count > 0) }); setMsg({ ok: true, text: `Created (${d.count} question(s) per student${d.short?.length ? `; the bank is short: ${d.short.join(", ")}` : ""}). Publish it from the list.` }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } }}>Create</button>
        <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <div className={msg.ok ? "ok" : "err"} data-msg>{msg.text}</div>}
    </div>
  );
}

type Row = { id: string; attemptNo: number; makeup: boolean; student?: { id: string; name: string; rollNumber: string }; startedAt: string; submittedAt: string | null; autoSubmitted: boolean; flagged: boolean; events: number; lostMs: number; score: number | null; maxScore: number | null; pending: number; answers: Record<string, unknown>; teacher: Record<string, number>; questionIds: string[]; line: string; log: { kind: string; at: string; awayMs: number | null }[] };
const LABEL: Record<string, string> = { FULLSCREEN_EXIT: "left full-screen", TAB_HIDDEN: "switched tab / app", BLUR: "lost focus", COPY: "copy blocked", PASTE: "paste blocked", CONTEXT_MENU: "right-click blocked", PRINT: "print blocked", CONNECTION_LOST: "connection lost (not counted)" };
export function QuizMonitor({ quizId, courseId, bank }: { quizId: string; courseId: string; bank: { id: string; type: string; text: string; marks: number }[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [seb, setSeb] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await fetch(`${API}?monitor=${quizId}`); const d = await r.json().catch(() => ({})); if (r.ok) { setRows(d.rows || []); setSeb(!!d.settings?.requireSeb); } else setErr(d.error || "Could not load."); }, [quizId]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  const t = (s: string) => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Karachi" });
  const written = (id: string) => { const q = bank.find((x) => x.id === id); return q && !["MCQ", "MCQ_MULTI", "TRUE_FALSE", "NUMERICAL"].includes(q.type) ? q : null; };
  return (
    <div>
      {seb && <div className="card small-note">This quiz requires Safe Exam Browser: <a href={`${API}?seb=${quizId}`}>download the .seb file</a> for the lab computers (students can download it from the quiz page too) · <a href="/student/safe-exam-browser">student guide</a>.</div>}
      {err && <div className="err">{err}</div>}
      <div className="card" style={{ overflowX: "auto" }} data-monitor>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Live monitor <span className="small-note">refreshes every 5 s</span></h3>
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Student</th><th>Status</th><th>Events</th><th>Score</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} data-run={r.student?.rollNumber}>
              <td>{r.student?.name} <span className="small-note">{r.student?.rollNumber}{r.attemptNo > 1 ? ` · attempt ${r.attemptNo}` : ""}{r.makeup ? " · make-up" : ""}</span></td>
              <td>{r.submittedAt ? `${r.autoSubmitted ? "Auto-submitted" : "Submitted"} ${t(r.submittedAt)}` : "In progress"}{r.flagged ? " · flagged" : ""}{r.lostMs ? ` · connection lost ${Math.round(r.lostMs / 60000)} min` : ""}</td>
              <td data-events>{r.line}<div className="small-note">{r.log.map((e, i) => <div key={i}>{t(e.at)} {LABEL[e.kind] || e.kind}{e.awayMs ? ` (${Math.round(e.awayMs / 1000)} s)` : ""}</div>)}</div></td>
              <td>{r.score !== null ? `${r.score}/${r.maxScore}` : "—"}{r.pending ? ` · ${r.pending} to mark` : ""}
                {r.submittedAt && r.questionIds.map((id) => written(id)).filter(Boolean).map((q) => <div key={q!.id} style={{ marginTop: 4 }} data-mark={q!.id}><MathText text={q!.text.slice(0, 80)} /><div style={{ whiteSpace: "pre-wrap", background: "var(--paper-2, #f7f3f4)", padding: 4 }}>{String(r.answers[q!.id] ?? "(blank)")}</div><input type="number" defaultValue={r.teacher[q!.id] ?? ""} placeholder={`of ${q!.marks}`} style={{ width: 60 }} onBlur={async (e) => { if (e.target.value === "") return; try { await call({ action: "mark", runId: r.id, questionId: q!.id, marks: Number(e.target.value) }); load(); } catch (x) { setErr((x as Error).message); } }} /></div>)}</td>
              <td><button className="btn btn-secondary btn-sm" onClick={async () => { const reason = prompt("Make-up for this student — reason (absent, a valid problem …)"); if (reason && r.student) { try { await call({ action: "makeup", quizId, studentId: r.student.id, reason }); alert("Make-up opened: different questions by the same rules, for 7 days."); } catch (x) { setErr((x as Error).message); } } }}>Make-up</button></td>
            </tr>))}</tbody></table>
        {!rows.length && <p className="small-note">No one has started yet. <a href={`/instructor/courses/${courseId}/quizzes`}>Back to quizzes</a></p>}
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", fontSize: 12 }}>Make-up for a student who did not take it: <input placeholder="Roll number" id="mk-roll" style={{ width: 140 }} data-makeup-roll /><input placeholder="Reason" id="mk-reason" data-makeup-reason /><button className="btn btn-secondary btn-sm" data-makeup-go onClick={async () => { const roll = (document.getElementById("mk-roll") as HTMLInputElement).value, reason = (document.getElementById("mk-reason") as HTMLInputElement).value; try { await call({ action: "makeup", quizId, rollNumber: roll, reason }); setErr(null); alert("Make-up opened."); } catch (x) { setErr((x as Error).message); } }}>Open make-up</button></div>
      </div>
    </div>
  );
}
