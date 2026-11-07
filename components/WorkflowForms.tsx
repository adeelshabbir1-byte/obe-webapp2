"use client";
import { useState } from "react";
const post = (b: unknown) => fetch("/api/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
const done = (r: { error?: string }, set: (m: string) => void) => { if (r.error) set(r.error); else location.reload(); };

export function NoteForm({ courseId, lectures, people, cqis }: { courseId: string; lectures: { n: number; topic: string }[]; people: { id: string; name: string }[]; cqis: { id: string; finding: string }[] }) {
  const [f, setF] = useState({ kind: "STRUGGLE", lectureNumber: String(lectures[0]?.n ?? ""), text: "", toUserId: "", cqiId: "" }); const [m, setM] = useState("");
  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12.5, alignItems: "end" }}>
    <label>Kind<br /><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="STRUGGLE">Students struggled here</option><option value="NOTE">Note on a topic</option><option value="WORKED">The fix worked (to the junior-batch teacher)</option></select></label>
    {f.kind !== "WORKED" ? <label>Lecture<br /><select value={f.lectureNumber} onChange={(e) => setF({ ...f, lectureNumber: e.target.value })}>{lectures.map((l) => <option key={l.n} value={l.n}>{l.n}. {l.topic.slice(0, 50)}</option>)}</select></label>
      : <><label>To<br /><select value={f.toUserId} onChange={(e) => setF({ ...f, toUserId: e.target.value })}><option value="">— teacher —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>CQI record it closes<br /><select value={f.cqiId} onChange={(e) => setF({ ...f, cqiId: e.target.value })}><option value="">— none —</option>{cqis.map((c) => <option key={c.id} value={c.id}>{c.finding.slice(0, 60)}</option>)}</select></label></>}
    <label style={{ flex: "1 1 240px" }}>Text<br /><input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} style={{ width: "100%" }} /></label>
    <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "note", courseId, ...f }), setM)}>Add</button><span className="small-note">{m}</span></div>;
}
export function LabSend({ codes }: { codes: string[] }) {
  const [f, setF] = useState({ code: codes[0] || "", week: "1", instructions: "", rubric: "" }); const [m, setM] = useState("");
  return <div style={{ fontSize: 12.5 }}><div style={{ display: "flex", gap: 6 }}><select value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })}>{codes.map((c) => <option key={c}>{c}</option>)}</select> Week <input type="number" min={1} value={f.week} onChange={(e) => setF({ ...f, week: e.target.value })} style={{ width: 55 }} /></div>
    <textarea rows={4} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="The week's lab: aim, steps, what to submit" style={{ width: "100%", marginTop: 4 }} />
    <textarea rows={2} value={f.rubric} onChange={(e) => setF({ ...f, rubric: e.target.value })} placeholder="Rubric checkpoints (one per line)" style={{ width: "100%" }} />
    <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "lab", ...f }), setM)}>Send to every campus</button> <span className="small-note">{m}</span></div>;
}
export function LabAck({ broadcastId, courses }: { broadcastId: string; courses: { id: string; label: string }[] }) {
  const [c, setC] = useState(courses[0]?.id || ""); const [n, setN] = useState(""); const [m, setM] = useState("");
  return <span style={{ fontSize: 12.5 }}><select value={c} onChange={(e) => setC(e.target.value)}>{courses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select> <input value={n} onChange={(e) => setN(e.target.value)} placeholder="note (optional)" /> <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "ack", broadcastId, courseId: c, note: n }), setM)}>The lab ran</button> <span className="small-note">{m}</span></span>;
}
export function ReviewAct({ id, open }: { id: string; open: boolean }) {
  const [d, setD] = useState(""); const [m, setM] = useState("");
  if (!open) return <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "review", publicCourseId: id }), setM)}>Send to the review committee</button>;
  return <span><input value={d} onChange={(e) => setD(e.target.value)} placeholder="Committee decision" style={{ width: 220 }} /> <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "decide", publicCourseId: id, accept: true, decision: d }), setM)}>Accept</button> <button type="button" className="btn btn-sm btn-secondary" onClick={async () => done(await post({ action: "decide", publicCourseId: id, accept: false, decision: d }), setM)}>Decline</button> <span className="small-note">{m}</span></span>;
}
