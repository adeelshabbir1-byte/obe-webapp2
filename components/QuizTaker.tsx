"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; stem: string; options: { i: number; text: string }[] };

/** Takes an online quiz: one page of questions, answers saved as they are chosen, countdown, auto-submit at time up. */
export default function QuizTaker({ quizId, items, saved, deadline }: { quizId: string; items: Item[]; saved: Record<string, number>; deadline: number }) {
  const router = useRouter();
  const [ans, setAns] = useState<Record<string, number>>(saved);
  const [left, setLeft] = useState(Math.max(0, deadline - Date.now()));
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  async function call(action: "save" | "submit", a = ans) {
    const r = await fetch("/api/student/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quizId, action, answers: a }) });
    return r.ok;
  }
  async function choose(qid: string, i: number) {
    const a = { ...ans, [qid]: i }; setAns(a); setState("saving");
    setState((await call("save", a)) ? "saved" : "error");
  }
  async function submit() {
    if (sent.current) return; sent.current = true; setBusy(true);
    await call("submit"); router.refresh();
  }
  useEffect(() => { const t = setInterval(() => { const l = deadline - Date.now(); setLeft(Math.max(0, l)); if (l <= 0) submit(); }, 1000); return () => clearInterval(t); }); // eslint-disable-line react-hooks/exhaustive-deps
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  const answered = Object.keys(ans).length;
  return (
    <div>
      <div style={{ position: "sticky", top: 0, background: "var(--paper, #fff)", padding: "8px 0", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #D5DCE4" }}>
        <b style={{ color: left < 60000 ? "#B3261E" : undefined, fontVariantNumeric: "tabular-nums" }}>⏱ {mm}:{String(ss).padStart(2, "0")}</b>
        <span className="small-note">{answered}/{items.length} answered {state === "saving" ? "· saving…" : state === "saved" ? "· saved" : state === "error" ? "· not saved, check your connection" : ""}</span>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { if (answered < items.length && !window.confirm(`${items.length - answered} questions are unanswered. Submit anyway?`)) return; submit(); }}>{busy ? "Submitting…" : "Submit"}</button>
      </div>
      {items.map((q, n) => (
        <div key={q.id} className="card" style={{ margin: "10px 0" }}>
          <div style={{ marginBottom: 6 }}><b>{n + 1}.</b> {q.stem}</div>
          {q.options.map((o, k) => (
            <label key={o.i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: ans[q.id] === o.i ? "#E5EEF9" : undefined }}>
              <input type="radio" name={q.id} checked={ans[q.id] === o.i} onChange={() => choose(q.id, o.i)} /> <span><b>{"ABCDEF"[k]}.</b> {o.text}</span>
            </label>))}
        </div>))}
    </div>
  );
}
