"use client";

import { useState } from "react";

const post = (b: unknown) => fetch("/api/cqi/remedies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
export function Choose({ id }: { id: string }) {
  const [r, setR] = useState("TUTORIAL"); const [n, setN] = useState(""); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}><select value={r} onChange={(e) => setR(e.target.value)}><option value="RETEACH">Re-teach in class (the plan shifts)</option><option value="TUTORIAL">Tutorial / make-up for the weak students</option><option value="PRACTICE">Practice material + short re-quiz</option></select><input value={n} onChange={(e) => setN(e.target.value)} placeholder="When / what" style={{ width: 170 }} /><button type="button" className="btn btn-sm" onClick={async () => { const x = await post({ action: "choose", id, remedy: r, note: n }); setM(x.error || "Chosen ✓"); if (!x.error) setTimeout(() => location.reload(), 500); }}>Choose</button>{r === "TUTORIAL" && <a className="small-note" href="/timetable/live?tab=finder">find a free slot →</a>} {m}</span>;
}
export function Close({ id }: { id: string }) {
  const [p, setP] = useState(""); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, fontSize: 12.5 }}>re-check average <input type="number" value={p} onChange={(e) => setP(e.target.value)} style={{ width: 60 }} />% <button type="button" className="btn-link" onClick={async () => { const x = await post({ action: "close", id, afterPct: Number(p) }); setM(x.error || (x.effective ? "Closed — effective ✓" : "Not enough — choose the next step")); if (!x.error) setTimeout(() => location.reload(), 900); }}>Record</button> {m}</span>;
}
export function Excuse({ id }: { id: string }) {
  const [r, setR] = useState(""); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, fontSize: 12.5 }}><input value={r} onChange={(e) => setR(e.target.value)} placeholder="reason" style={{ width: 150 }} /><button type="button" className="btn-link" onClick={async () => { const x = await post({ action: "excuse", id, reason: r }); setM(x.error || "Excused"); }}>Excuse</button> {m}</span>;
}
export function Bank({ code, topic, v }: { code: string; topic: string; v: { video?: string | null; examples?: string | null; practice?: string | null; quiz?: string | null } }) {
  const [f, setF] = useState({ video: v.video || "", examples: v.examples || "", practice: v.practice || "", quiz: v.quiz || "" }); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", fontSize: 12 }}>{(["video", "examples", "practice", "quiz"] as const).map((k) => <input key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={k === "video" ? "video link" : k === "quiz" ? "re-quiz questions" : k} style={{ width: 130 }} />)}<button type="button" className="btn-link" onClick={async () => { const x = await post({ action: "bank", courseCode: code, topic, ...f }); setM(x.error || "✓"); }}>Save</button> {m}</span>;
}
