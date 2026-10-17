"use client";
import { useState } from "react";

/** Import a national release course into one of my courses (with a confirm step when it would replace a plan). */
export default function NationalImport({ releaseCourseId, courses }: { releaseCourseId: string; courses: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false); const [target, setTarget] = useState(courses[0]?.id || ""); const [msg, setMsg] = useState(""); const [confirm, setConfirm] = useState(false);
  if (!courses.length) return null;
  async function go(confirmReplace = false) {
    const r = await fetch("/api/national-bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", releaseCourseId, targetCourseId: target, confirmReplace }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setMsg(`Imported: ${d.cloCount} CLOs, ${d.lectureRowCount} lectures, ${d.instrumentCount} assessments. Make it your own in the course editor.`); setConfirm(false); }
    else if (d.needsConfirm) { setConfirm(true); setMsg(d.error); } else setMsg(d.error || "Import failed.");
  }
  if (!open) return <button type="button" className="btn btn-sm" style={{ background: "#1E7B3C", borderColor: "#1E7B3C" }} onClick={() => setOpen(true)}>Use in my course</button>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
      <select value={target} onChange={(e) => setTarget(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
      {confirm ? <button type="button" className="btn btn-sm" onClick={() => go(true)}>Yes, replace the plan</button> : <button type="button" className="btn btn-sm" onClick={() => go(false)}>Import</button>}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setMsg(""); }}>Cancel</button><span>{msg}</span>
    </span>
  );
}
