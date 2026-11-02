"use client";
import { useState } from "react";
import type { PracticeQ } from "../lib/practicePool";

export default function PracticeSet({ questions }: { questions: PracticeQ[] }) {
  const [pick, setPick] = useState<Record<string, number>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const right = questions.filter((q) => q.options.length && pick[q.id] !== undefined && q.correct.includes(pick[q.id])).length;
  const tried = questions.filter((q) => q.options.length && pick[q.id] !== undefined).length;
  return (
    <div>
      {tried > 0 && <p className="small-note" data-score>{right} of {tried} multiple-choice answers right so far.</p>}
      {questions.map((q, n) => (
        <div key={q.id} className="card" style={{ marginBottom: 10 }} data-practice-q={q.id}>
          <p style={{ fontSize: 12, color: "#6A7179", margin: 0 }}>Q{n + 1} · {q.cloCodes.join(", ")}{q.topic ? ` · ${q.topic}` : ""} · {q.difficulty.toLowerCase()}</p>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{q.text}</p>
          {q.options.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {q.options.map((o, i) => {
                const chosen = pick[q.id] === i, done = pick[q.id] !== undefined, ok = q.correct.includes(i);
                return <button key={i} type="button" disabled={done} onClick={() => setPick({ ...pick, [q.id]: i })} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "1px solid #D5D8DC", background: done && ok ? "#E3F2E8" : chosen ? "#FBE4E2" : "#fff", cursor: done ? "default" : "pointer", minHeight: 40 }}>({String.fromCharCode(97 + i)}) {o}{done && ok ? " ✓" : ""}</button>;
              })}
            </div>
          )}
          {!q.options.length && (q.answer ? (shown[q.id] ? <p style={{ background: "#F7F6F1", padding: 8, borderRadius: 6, whiteSpace: "pre-wrap", fontSize: 13.5 }}><b>Answer:</b> {q.answer}</p> : <button className="btn btn-secondary btn-sm" onClick={() => setShown({ ...shown, [q.id]: true })}>Show answer</button>) : <p className="small-note">Write your answer, then discuss it with your teacher.</p>)}
        </div>
      ))}
    </div>
  );
}
