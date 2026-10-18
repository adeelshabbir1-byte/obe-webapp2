"use client";
import { useEffect, useRef, useState } from "react";

// "Ask OBE Assistant": a chat panel about this course's CLOs and PLOs. Hidden unless the Institute Head switched it on.
export default function ObeAssistant({ courseId, courseLabel }: { courseId?: string; courseLabel?: string }) {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch("/api/obe-assistant").then((r) => r.json()).then((d) => { setOn(!!d.enabled); setLeft(d.left ?? null); }).catch(() => null); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, busy]);
  if (!on) return null;
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(""); setQ("");
    const r = await fetch("/api/obe-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, question: text, history: chat }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "No answer."); setQ(text); return; }
    setChat((c) => [...c, { q: text, a: d.answer }]); setLeft(d.left ?? left);
  }
  const starters = courseId
    ? ["Why is each CLO mapped to its GA? Is any mapping weak?", "Are my CLOs at the right Bloom level for this semester?", "Which CLO has too few topics or assessments?", "Rewrite my weakest CLO to be measurable."]
    : ["What is the difference between GA-2 and GA-3?", "How do I write a measurable CLO?", "How is GA attainment calculated?"];
  return (
    <>
      <button className="no-print" onClick={() => setOpen(!open)} style={{ position: "fixed", right: 18, bottom: 18, zIndex: 120, background: "#3A1218", color: "#fff", border: 0, borderRadius: 24, padding: "10px 16px", fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,.25)", cursor: "pointer" }}>{open ? "Close assistant" : "💬 Ask OBE Assistant"}</button>
      {open && (
        <div className="no-print" style={{ position: "fixed", right: 18, bottom: 70, zIndex: 120, width: "min(420px, calc(100vw - 36px))", height: "min(560px, 70vh)", background: "#fff", border: "1px solid #E6DADC", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.2)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #F0EAEA" }}><b>OBE Assistant</b>{courseLabel && <span style={{ fontSize: 12, color: "var(--slate)" }}> · {courseLabel}</span>}<div style={{ fontSize: 11, color: "var(--slate)" }}>Suggestions only — the OMC approves mapping changes.{left != null ? ` ${left} questions left today.` : ""}</div></div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, fontSize: 13 }}>
            {chat.length === 0 && <div><div style={{ color: "var(--slate)", marginBottom: 6 }}>Try:</div>{starters.map((s) => <button key={s} className="act" style={{ display: "block", marginBottom: 6, textAlign: "left" }} onClick={() => ask(s)}>{s}</button>)}</div>}
            {chat.map((m, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ background: "#F3EEF7", borderRadius: 8, padding: "6px 8px", marginLeft: 30 }}>{m.q}</div>
                <div style={{ background: "#F7F4F3", borderRadius: 8, padding: "6px 8px", marginTop: 4, marginRight: 20, whiteSpace: "pre-wrap" }}>{m.a}</div>
              </div>
            ))}
            {busy && <div style={{ color: "var(--slate)" }}>Thinking…</div>}
            {err && <div style={{ color: "#B3261E" }}>{err}</div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(q); }} style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid #F0EAEA" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your CLOs, GAs, Bloom levels…" style={{ flex: 1 }} disabled={busy || left === 0} />
            <button className="btn btn-sm" disabled={busy || !q.trim() || left === 0}>Ask</button>
          </form>
        </div>
      )}
    </>
  );
}
