"use client";
import { useState } from "react";

// Queue item 21: the forward degree plan editor — each course labelled home only / network-open / home or online.
const post = (b: unknown) => fetch("/api/consortium/network", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
export function PlanEditor({ program, courses, labels: L, intake: I, bos: B, canPublish }: { program: string; courses: { code: string; title: string; creditHours: number; semesterNumber: number | null }[]; labels: Record<string, string>; intake: string; bos: string; canPublish: boolean }) {
  const [labels, setLabels] = useState<Record<string, string>>(L); const [intake, setIntake] = useState(I); const [bos, setBos] = useState(B); const [m, setM] = useState("");
  const save = async (publish: boolean) => { const r = await post({ action: "plan", program, intake, labels, bos, publish }); setM(r.error || (publish ? "Published ✓ — partner universities and students now see it" : "Saved ✓")); if (!r.error) setTimeout(() => location.reload(), 700); };
  return <div style={{ fontSize: 12.5 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
      <label>Intake<br /><input value={intake} onChange={(e) => setIntake(e.target.value)} placeholder="Fall 2027" style={{ width: 100 }} /></label>
      <label>Board of Studies approval (meeting, date, minute no.)<br /><input value={bos} onChange={(e) => setBos(e.target.value)} style={{ width: 300 }} /></label>
      <span>Set all to: {(["HOME", "NETWORK", "ONLINE"] as const).map((k) => <button key={k} type="button" className="btn-link" onClick={() => setLabels(Object.fromEntries(courses.map((c) => [c.code, k])))}>{k.toLowerCase()}</button>)}</span>
    </div>
    <table className="table" style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Sem.</th><th>Course</th><th>CH</th><th>Where it may be taken</th></tr></thead>
      <tbody>{courses.map((c) => <tr key={c.code}><td>{c.semesterNumber ?? "—"}</td><td>{c.code} {c.title}</td><td>{c.creditHours}</td><td><select value={labels[c.code] || "HOME"} onChange={(e) => setLabels({ ...labels, [c.code]: e.target.value })} aria-label={`Label of ${c.code}`}><option value="HOME">Home only</option><option value="NETWORK">Network-open</option><option value="ONLINE">Home or online</option></select></td></tr>)}</tbody></table>
    <button type="button" className="btn btn-sm btn-secondary" onClick={() => save(false)}>Save draft</button> {canPublish && <button type="button" className="btn btn-sm" onClick={() => save(true)}>Publish (BOS approved)</button>} <span className="small-note" role="status">{m}</span>
  </div>;
}
