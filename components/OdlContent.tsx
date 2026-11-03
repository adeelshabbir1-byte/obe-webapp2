"use client";

import { useState } from "react";

// One lecture topic's ODL module (7.v): recorded video, self-assessment questions, further reading, references, and how
// learners interact (Toolkit Part-F 40). YouTube length and captions are read automatically when YouTube is connected.
type M = { videoUrl: string | null; videoTitle: string | null; videoMin: number | null; captions: boolean; selfQ: number; readingUrl: string | null; readingMin: number | null; refs: string | null; interaction: string | null } | null;
const post = (b: unknown) => fetch("/api/odl-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));

export function ModuleRow({ courseId, n, topic, week, clo, m, canAct, bankQ }: { courseId: string; n: number; topic: string; week: number; clo: string | null; m: M; canAct: boolean; bankQ: number }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ videoUrl: m?.videoUrl || "", videoMin: m?.videoMin == null ? "" : String(m.videoMin), captions: !!m?.captions, selfQ: String(m?.selfQ ?? 0), readingUrl: m?.readingUrl || "", readingMin: m?.readingMin == null ? "" : String(m.readingMin), refs: m?.refs || "", interaction: m?.interaction || "" });
  const [msg, setMsg] = useState("");
  const ready = !!(m && (m.videoUrl || m.readingUrl) && m.selfQ > 0);
  const long = (m?.videoMin || 0) >= 30;
  return <>
    <tr>
      <td>{n}</td><td>{week}</td><td>{topic}{clo && <span className="small-note"> · {clo}</span>}</td>
      <td>{m?.videoUrl ? <a href={m.videoUrl} target="_blank" rel="noopener noreferrer">{m.videoTitle || "video"}</a> : "—"}{m?.videoMin != null && <span style={{ color: long ? "#B3261E" : undefined }}> · {m.videoMin} min{long ? " (over 30)" : ""}</span>}{m?.videoUrl && !m.captions && <span className="small-note"> · no captions</span>}</td>
      <td>{m?.selfQ || 0}</td><td>{m?.readingUrl ? <a href={m.readingUrl} target="_blank" rel="noopener noreferrer">reading</a> : "—"}</td>
      <td style={{ color: ready ? "#1E6B3A" : "#8A5A00" }}>{ready ? "✓ ready" : "incomplete"}</td>
      <td>{canAct && <button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "close" : "edit"}</button>}</td>
    </tr>
    {open && <tr><td colSpan={8}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, fontSize: 12.5 }}>
        <label>Recorded video (YouTube or https link)<input value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} style={{ width: "100%" }} /></label>
        <label>Length (min) — read from YouTube when connected<input type="number" value={f.videoMin} onChange={(e) => setF({ ...f, videoMin: e.target.value })} style={{ width: "100%" }} /></label>
        <label><input type="checkbox" checked={f.captions} onChange={(e) => setF({ ...f, captions: e.target.checked })} /> closed captions / transcript (Toolkit Part-F 66)</label>
        <label>Self-assessment questions <span className="small-note">({bankQ} in the bank for {clo || "this CLO"})</span><input type="number" value={f.selfQ} onChange={(e) => setF({ ...f, selfQ: e.target.value })} style={{ width: "100%" }} /></label>
        <label>Further reading (https link)<input value={f.readingUrl} onChange={(e) => setF({ ...f, readingUrl: e.target.value })} style={{ width: "100%" }} /></label>
        <label>Reading time (min)<input type="number" value={f.readingMin} onChange={(e) => setF({ ...f, readingMin: e.target.value })} style={{ width: "100%" }} /></label>
        <label style={{ gridColumn: "1 / -1" }}>References and permissions (source, licence: Creative Commons, fair use …; ODL 7.x–7.xi)<textarea rows={2} value={f.refs} onChange={(e) => setF({ ...f, refs: e.target.value })} style={{ width: "100%" }} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Interaction: student–student, student–teacher or student–content activity<input value={f.interaction} onChange={(e) => setF({ ...f, interaction: e.target.value })} style={{ width: "100%" }} /></label>
      </div>
      <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={async () => { const r = await post({ action: "module", courseId, n, data: f }); if (r.error) setMsg(r.error); else location.reload(); }}>Save module</button> <span className="small-note">{msg}</span>
    </td></tr>}
  </>;
}

export function SignOff({ courseId, as, label, done, can }: { courseId: string; as: "SE" | "ID"; label: string; done: string | null; can: boolean }) {
  const [m, setM] = useState("");
  return <div style={{ fontSize: 13 }}>{label}: {done ? <b style={{ color: "#1E6B3A" }}>✓ {done}</b> : can ? <><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "sign", courseId, as }); if (r.error) setM(r.error); else location.reload(); }}>Sign off the content</button> <span className="small-note">{m}</span></> : <span className="small-note">not yet</span>}</div>;
}
