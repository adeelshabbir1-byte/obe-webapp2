"use client";
import { useState } from "react";

type Q = { prompt: string; options: string[]; answer: number; why: string };

// A quiz: pick answers, press Check — shows right/wrong with the reason, and saves the best score.
export default function ObeQuiz({ questions, progressKey, passMark }: { questions: Q[]; progressKey: string; passMark: number }) {
  const [pick, setPick] = useState<(number | null)[]>(questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const score = questions.filter((q, i) => pick[i] === q.answer).length;
  async function check() {
    setChecked(true);
    await fetch("/api/learn/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: progressKey, score: questions.filter((q, i) => pick[i] === q.answer).length, total: questions.length, passMark }) }).catch(() => null);
  }
  if (!questions.length) return <p style={{ color: "var(--slate)" }}>No questions available yet.</p>;
  return (
    <div>
      {questions.map((q, i) => (
        <div key={i} className="card" style={{ margin: "0 0 10px", borderLeft: checked ? `4px solid ${pick[i] === q.answer ? "#2E7D4F" : "#B3261E"}` : undefined }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{i + 1}. {q.prompt}</div>
          {q.options.map((o, k) => (
            <label key={k} style={{ display: "block", fontSize: 13, padding: "3px 0", color: checked && k === q.answer ? "#1F5E36" : checked && pick[i] === k ? "#B3261E" : undefined, fontWeight: checked && k === q.answer ? 700 : 400 }}>
              <input type="radio" name={`q${i}`} disabled={checked} checked={pick[i] === k} onChange={() => setPick(pick.map((x, j) => (j === i ? k : x)))} style={{ marginRight: 6 }} />{o}
            </label>
          ))}
          {checked && q.why && <div style={{ fontSize: 12.5, marginTop: 6, background: "#F7F4F3", padding: "6px 8px", borderRadius: 6 }}>{q.why}</div>}
        </div>
      ))}
      {!checked ? <button className="btn" disabled={pick.some((x) => x === null)} onClick={check}>Check answers</button> : (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <b style={{ color: score >= passMark ? "#1F5E36" : "#95650F" }}>{score} / {questions.length} {score >= passMark ? "— passed ✓" : `— ${passMark} needed to pass`}</b>
          <button className="btn btn-secondary" onClick={() => { setPick(questions.map(() => null)); setChecked(false); }}>Try again</button>
        </div>
      )}
    </div>
  );
}
