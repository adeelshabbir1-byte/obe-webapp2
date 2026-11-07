"use client";
import { useState } from "react";
const post = (b: unknown) => fetch("/api/work-monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
const done = (r: { error?: string }, set: (m: string) => void) => { if (r.error) set(r.error); else location.reload(); };

export function AdviserNoteForm({ studentId }: { studentId: string }) {
  const [t, setT] = useState(""); const [term, setTerm] = useState(""); const [ok, setOk] = useState(false); const [m, setM] = useState("");
  return <div style={{ fontSize: 12.5, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
    <label style={{ flex: "1 1 260px" }}>Meeting note<br /><input value={t} onChange={(e) => setT(e.target.value)} style={{ width: "100%" }} /></label>
    <label>Semester plan<br /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Spring 2027" style={{ width: 110 }} /></label>
    <label><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> plan approved</label>
    <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "advisernote", studentId, text: t, planTerm: term, planApproved: ok }), setM)}>Save</button><span className="small-note">{m}</span></div>;
}
export function LabNeedForm({ courses, labs }: { courses: { id: string; label: string }[]; labs: { id: string; name: string }[] }) {
  const [f, setF] = useState({ courseId: courses[0]?.id || "", category: "Computer", perStudents: "1", labId: "" }); const [m, setM] = useState("");
  return <div style={{ fontSize: 12.5, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
    <label>Course<br /><select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <label>Equipment (asset category)<br /><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></label>
    <label>One per N students<br /><input type="number" min={1} value={f.perStudents} onChange={(e) => setF({ ...f, perStudents: e.target.value })} style={{ width: 60 }} /></label>
    <label>Lab<br /><select value={f.labId} onChange={(e) => setF({ ...f, labId: e.target.value })}><option value="">any</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "labneed", ...f }), setM)}>Add</button><span className="small-note">{m}</span></div>;
}
export function SeedCompliance({ bodies }: { bodies: string[] }) {
  const [b, setB] = useState(bodies[0] || ""); const [m, setM] = useState("");
  return <span style={{ fontSize: 12.5 }}><select value={b} onChange={(e) => setB(e.target.value)}>{bodies.map((x) => <option key={x}>{x}</option>)}</select> <button type="button" className="btn btn-sm btn-secondary" onClick={async () => done(await post({ action: "seed", body: b }), setM)}>Add this council&apos;s standards</button> <span className="small-note">{m}</span></span>;
}
export function ComplianceRow({ item, people }: { item: { id: string; ownerId: string | null; dueDate: string | null; status: string; evidenceUrl: string | null; improvement: string | null }; people: { id: string; name: string }[] }) {
  const [f, setF] = useState({ ownerId: item.ownerId || "", dueDate: item.dueDate || "", status: item.status, evidenceUrl: item.evidenceUrl || "", improvement: item.improvement || "" }); const [m, setM] = useState("");
  const save = async (g: typeof f) => { const r = await post({ action: "compliance", item: { id: item.id, ...g } }); setM(r.error || "✓"); };
  const set = (k: keyof typeof f, v: string) => { const g = { ...f, [k]: v }; setF(g); if (k === "ownerId" || k === "status" || k === "dueDate") save(g); };
  return <>
    <td><select value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)} aria-label="Owner"><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
    <td><input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} aria-label="Due" /></td>
    <td><select value={f.status} onChange={(e) => set("status", e.target.value)} aria-label="Status"><option value="OPEN">open</option><option value="MET">met</option></select></td>
    <td><input value={f.evidenceUrl} onChange={(e) => setF({ ...f, evidenceUrl: e.target.value })} onBlur={() => save(f)} placeholder="evidence link" style={{ width: 140 }} aria-label="Evidence" /></td>
    <td><input value={f.improvement} onChange={(e) => setF({ ...f, improvement: e.target.value })} onBlur={() => save(f)} placeholder="improvement action" style={{ width: 170 }} aria-label="Improvement" /> <span className="small-note">{m}</span></td></>;
}
export function AddCompliance() {
  const [f, setF] = useState({ body: "QEC", code: "", title: "" }); const [m, setM] = useState("");
  return <div style={{ fontSize: 12.5, display: "flex", gap: 6, flexWrap: "wrap" }}><input value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ width: 70 }} aria-label="Body" /><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="code" style={{ width: 80 }} /><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="requirement, as written by the body" style={{ width: 340 }} /><button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "compliance", item: f }), setM)}>Add</button><span className="small-note">{m}</span></div>;
}
