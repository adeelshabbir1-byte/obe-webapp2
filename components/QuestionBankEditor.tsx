"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuestionBankEditor({ course, rows }: { course: { id: string; code: string; title: string }; rows: { id: string; prompt: string; options: string[]; answer: number }[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [opts, setOpts] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState(0);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");
  async function add() {
    setErr("");
    const r = await fetch("/api/learn/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ masterCourseId: course.id, prompt, options: opts, answer, explanation: why }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || "Could not save."); return; }
    setPrompt(""); setOpts(["", "", "", ""]); setAnswer(0); setWhy(""); router.refresh();
  }
  async function del(id: string) { if (!confirm("Delete this question?")) return; await fetch(`/api/learn/questions?id=${id}`, { method: "DELETE" }); router.refresh(); }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{course.code} — {course.title}</h3>
      {err && <div className="err">{err}</div>}
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="Question (e.g. Which assessment best measures CLO-3 of this course?)" style={{ width: "100%" }} />
      {opts.map((o, i) => <label key={i} style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0", fontSize: 13 }}><input type="radio" checked={answer === i} onChange={() => setAnswer(i)} title="Correct answer" /><input value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}${i > 1 ? " (optional)" : ""}`} style={{ flex: 1 }} /></label>)}
      <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="Why this is the right answer (shown after answering)" style={{ width: "100%" }} />
      <button className="btn" onClick={add} disabled={!prompt.trim()}>Add question</button> <span style={{ fontSize: 12, color: "var(--slate)" }}>Tick the circle next to the correct option.</span>
      {rows.length > 0 && <h4>Your questions ({rows.length})</h4>}
      {rows.map((r) => <div key={r.id} style={{ borderTop: "1px solid #F0EAEA", padding: "6px 0", fontSize: 13 }}>{r.prompt} <span style={{ color: "#1F5E36" }}>→ {r.options[r.answer]}</span> <button className="act act-danger" onClick={() => del(r.id)}>Delete</button></div>)}
    </div>
  );
}
