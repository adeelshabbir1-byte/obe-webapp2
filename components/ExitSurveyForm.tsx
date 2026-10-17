"use client";
import { useState } from "react";
import type { Form } from "../lib/exitSurveys";

export default function ExitSurveyForm({ token, form }: { token: string; form: Form }) {
  const [a, setA] = useState<Record<string, unknown>>({}); const [done, setDone] = useState(false); const [msg, setMsg] = useState("");
  async function send() { const r = await fetch(`/api/exit/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) }); const d = await r.json().catch(() => ({})); if (r.ok) setDone(true); else setMsg(d.error || "Could not send."); }
  if (done) return <p style={{ color: "#1F5E36" }}>Thank you. Your answers have been recorded.</p>;
  return (
    <div>
      {form.questions.map((q) => (
        <div key={q.key} style={{ margin: "12px 0" }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>{q.label}</div>
          {q.type === "rating" && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={a[q.key] === n ? "btn btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setA({ ...a, [q.key]: n })}>{n}{n === 1 ? " Poor" : n === 5 ? " Excellent" : ""}</button>)}</div>}
          {q.type === "choice" && <select value={String(a[q.key] || "")} onChange={(e) => setA({ ...a, [q.key]: e.target.value })} style={{ width: "100%" }}><option value="">— choose —</option>{q.options!.map((o) => <option key={o}>{o}</option>)}</select>}
          {q.type === "yesno" && <div style={{ display: "flex", gap: 6 }}>{[["Yes", true], ["No", false]].map(([l, v]) => <button key={String(l)} type="button" className={a[q.key] === v ? "btn btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setA({ ...a, [q.key]: v })}>{String(l)}</button>)}</div>}
          {q.type === "text" && <textarea rows={2} style={{ width: "100%" }} value={String(a[q.key] || "")} onChange={(e) => setA({ ...a, [q.key]: e.target.value })} />}
        </div>))}
      {msg && <div className="err">{msg}</div>}
      <button type="button" className="btn" onClick={send}>Submit</button>
    </div>
  );
}
