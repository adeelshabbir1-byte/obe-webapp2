"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; prompt: string; options: string[] };
export function StartExam({ badge, label }: { badge: string; label: string }) {
  const router = useRouter(); const [msg, setMsg] = useState("");
  return <span><button type="button" className="btn btn-sm" onClick={async () => { const r = await fetch("/api/learn/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badge, action: "start" }) }); const d = await r.json().catch(() => ({})); if (r.ok) router.push(`/learn/certification?exam=${badge}`); else setMsg(d.error || "Could not start."); }}>{label}</button> <span className="small-note">{msg}</span></span>;
}
export default function CertExam({ badge, items, endsAt }: { badge: string; items: Item[]; endsAt: number }) {
  const router = useRouter();
  const [ans, setAns] = useState<Record<string, number>>({}); const [left, setLeft] = useState(endsAt - Date.now()); const [res, setRes] = useState<{ score: number; total: number; passed: boolean; id: string } | null>(null);
  async function submit() { const r = await fetch("/api/learn/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badge, action: "submit", answers: ans }) }); const d = await r.json().catch(() => ({})); if (r.ok) setRes(d); }
  useEffect(() => { const t = setInterval(() => { const l = endsAt - Date.now(); setLeft(l); if (l <= 0 && !res) { clearInterval(t); submit(); } }, 1000); return () => clearInterval(t); }); // eslint-disable-line react-hooks/exhaustive-deps
  if (res) return <div className="card"><h3 style={{ marginTop: 0 }}>{res.passed ? "Passed — badge earned" : "Not passed this time"}</h3><p>Score {res.score}/{res.total}.</p>{res.passed ? <a className="btn btn-sm" href={`/learn/certificate/${res.id}`}>View certificate</a> : <p className="small-note">Review the lessons and try again in an hour.</p>} <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push("/learn/certification")}>Back</button></div>;
  const m = Math.max(0, Math.floor(left / 60000)), s = Math.max(0, Math.floor((left % 60000) / 1000));
  return (
    <div>
      <div style={{ position: "sticky", top: 0, background: "var(--paper, #fff)", padding: "6px 0", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #D5DCE4", zIndex: 2 }}><b>⏱ {m}:{String(s).padStart(2, "0")}</b><span className="small-note">{Object.keys(ans).length}/{items.length} answered</span><button type="button" className="btn btn-sm" onClick={submit}>Submit</button></div>
      {items.map((q, n) => <div key={q.id} className="card" style={{ margin: "8px 0" }}><div><b>{n + 1}.</b> {q.prompt}</div>{q.options.map((o, i) => <label key={i} style={{ display: "flex", gap: 8, padding: "4px 6px", cursor: "pointer", background: ans[q.id] === i ? "#E5EEF9" : undefined }}><input type="radio" name={q.id} checked={ans[q.id] === i} onChange={() => setAns({ ...ans, [q.id]: i })} />{o}</label>)}</div>)}
    </div>
  );
}
