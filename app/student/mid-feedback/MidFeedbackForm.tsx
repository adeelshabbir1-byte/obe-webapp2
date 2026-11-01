"use client";

import { useState } from "react";

export default function MidFeedbackForm({ courseId, topics }: { courseId: string; topics: string[] }) {
  const [pace, setPace] = useState(""); const [clarity, setClarity] = useState(0); const [hard, setHard] = useState(""); const [comment, setComment] = useState(""); const [msg, setMsg] = useState("");
  if (msg === "done") return <p style={{ color: "#1B6B3A" }}>Thank you — sent anonymously ✓</p>;
  return (
    <div style={{ fontSize: 13.5, display: "grid", gap: 8 }}>
      <div>Pace: {[["SLOW", "Too slow"], ["RIGHT", "About right"], ["FAST", "Too fast"]].map(([k, l]) => <label key={k} style={{ marginRight: 10 }}><input type="radio" checked={pace === k} onChange={() => setPace(k)} /> {l}</label>)}</div>
      <div>How clear is the teaching? {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setClarity(n)} style={{ marginRight: 4, fontWeight: clarity === n ? 800 : 400, border: "1px solid #ccc", borderRadius: 6, background: clarity >= n ? "#FFE9A8" : "#fff", padding: "1px 8px" }}>{n}</button>)} <span className="small-note">1 = not clear, 5 = very clear</span></div>
      <label>Hardest topic so far <select value={hard} onChange={(e) => setHard(e.target.value)}><option value="">—</option>{topics.map((t) => <option key={t}>{t}</option>)}</select></label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="One comment (optional)" rows={2} />
      <div><button type="button" className="btn btn-sm" onClick={async () => { const r = await fetch("/api/student/mid-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, pace, clarity, hardestTopic: hard, comment }) }).then((x) => x.json()).catch(() => ({ error: "Could not send." })); setMsg(r.error || "done"); }}>Send</button> {msg && msg !== "done" && <span style={{ color: "#B3261E" }}>{msg}</span>}</div>
    </div>
  );
}
