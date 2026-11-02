"use client";
import { useState } from "react";

const post = (b: unknown) => fetch("/api/observations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
export function ObserveForm({ courses, areas, rating }: { courses: { id: string; label: string }[]; areas: [string, string][]; rating: Record<number, string> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ courseId: "", lectureNumber: "", observedOn: new Date().toISOString().slice(0, 10), taughtTopic: "", strengths: "", improve: "", cqi: false });
  const [sc, setSc] = useState<Record<string, number>>({}); const [planned, setPlanned] = useState<string | null>(null); const [m, setM] = useState("");
  const look = async (courseId: string, n: string) => { if (!courseId || !n) return setPlanned(null); const d = await fetch(`/api/observations?courseId=${courseId}&n=${n}`).then((r) => r.json()).catch(() => ({})); setPlanned(d.topic || null); };
  if (!open) return <p><button type="button" className="btn" onClick={() => setOpen(true)} data-observe>Record an observation</button></p>;
  return (
    <div className="card" data-observe-form>
      <h3 style={{ marginTop: 0 }}>Record an observation</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
        <label>Class<br /><select value={f.courseId} onChange={(e) => { setF({ ...f, courseId: e.target.value }); look(e.target.value, f.lectureNumber); }} style={{ maxWidth: 420 }}><option value="">— choose —</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label>Lecture no.<br /><input type="number" min={1} value={f.lectureNumber} onChange={(e) => { setF({ ...f, lectureNumber: e.target.value }); look(f.courseId, e.target.value); }} style={{ width: 80 }} /></label>
        <label>Date<br /><input type="date" value={f.observedOn} onChange={(e) => setF({ ...f, observedOn: e.target.value })} /></label>
      </div>
      {planned && <p style={{ fontSize: 13 }}>Planned topic: <b>{planned}</b></p>}
      <label style={{ fontSize: 13 }}>Topic actually taught<br /><input value={f.taughtTopic} onChange={(e) => setF({ ...f, taughtTopic: e.target.value })} style={{ width: "100%" }} /></label>
      <table style={{ fontSize: 13, marginTop: 8 }}><tbody>{areas.map(([k, l]) => <tr key={k}><td>{l}</td><td>{[1, 2, 3, 4].map((v) => <button key={v} type="button" className={sc[k] === v ? "btn btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setSc({ ...sc, [k]: v })} title={rating[v]} style={{ marginRight: 3 }}>{v}</button>)}</td></tr>)}</tbody></table>
      <p className="small-note">1 needs a lot of work · 2 needs some work · 3 good · 4 very good</p>
      <label style={{ fontSize: 13, display: "block" }}>Strengths<br /><textarea rows={2} value={f.strengths} onChange={(e) => setF({ ...f, strengths: e.target.value })} style={{ width: "100%" }} /></label>
      <label style={{ fontSize: 13, display: "block" }}>To improve<br /><textarea rows={2} value={f.improve} onChange={(e) => setF({ ...f, improve: e.target.value })} style={{ width: "100%" }} /></label>
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.cqi} onChange={(e) => setF({ ...f, cqi: e.target.checked })} /> Raise the areas to improve as a CQI item</label>
      <div style={{ marginTop: 8 }}><button type="button" className="btn" disabled={!f.courseId} onClick={async () => { const r = await post({ ...f, scores: sc }); if (!r.ok) setM(r.d.error || "Not saved."); else location.reload(); }}>Save and share with the teacher</button> <span className="small-note">{m}</span></div>
    </div>
  );
}
export function ReplyForm({ id }: { id: string }) {
  const [t, setT] = useState(""); const [m, setM] = useState("");
  return <div style={{ marginTop: 4 }}><textarea rows={2} value={t} onChange={(e) => setT(e.target.value)} placeholder="Your reply" style={{ width: "100%" }} /><button type="button" className="btn btn-sm" disabled={!t.trim()} onClick={async () => { const r = await post({ action: "reply", id, text: t }); if (!r.ok) setM(r.d.error || "Not saved."); else location.reload(); }}>Reply</button> <span className="small-note">{m}</span></div>;
}
