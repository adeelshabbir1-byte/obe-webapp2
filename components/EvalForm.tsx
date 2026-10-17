"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EvalForm({ courseId, kind, title, items, done }: { courseId: string; kind: string; title: string; items: [string, string][]; done: boolean }) {
  const router = useRouter(); const [a, setA] = useState<Record<string, number>>({}); const [c, setC] = useState(""); const [msg, setMsg] = useState("");
  if (done) return <p className="small-note">✓ {title} submitted. Thank you.</p>;
  async function send() { const r = await fetch("/api/student/evaluation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, kind, answers: a, comment: c }) }); const d = await r.json().catch(() => ({})); if (r.ok) router.refresh(); else setMsg(d.error || "Failed."); }
  return (
    <div style={{ marginTop: 10 }}>
      <b>{title}</b> <span className="small-note">1 = strongly disagree … 5 = strongly agree. Anonymous: teachers see only class averages after 5+ students answer.</span>
      {items.map(([k, l]) => <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "4px 0", fontSize: 13.5 }}><span style={{ flex: "1 1 260px" }}>{l}</span>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={a[k] === n ? "btn btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setA({ ...a, [k]: n })}>{n}</button>)}</div>)}
      <textarea rows={2} style={{ width: "100%" }} placeholder="Comments (optional)" value={c} onChange={(e) => setC(e.target.value)} />
      <button type="button" className="btn btn-sm" onClick={send}>Submit {title.toLowerCase()}</button> {msg && <span className="err">{msg}</span>}
    </div>
  );
}
