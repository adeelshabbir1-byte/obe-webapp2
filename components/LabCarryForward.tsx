"use client";

import { useState } from "react";

export default function LabCarryForward({ courseId, rows }: { courseId: string; rows: { name: string; pct: number }[] }) {
  const [m, setM] = useState("");
  if (!rows.length) return null;
  return <div className="card" style={{ borderLeft: "4px solid #1565C0" }}><b>Repeaters who passed this lab before</b> <span className="small-note">(Controller setting: carry lab marks forward)</span>
    <p style={{ fontSize: 13, margin: "4px 0" }}>{rows.map((r) => `${r.name} (${r.pct}%)`).join(", ")}</p>
    {m ? <span className="small-note">{m}</span> : <button type="button" className="btn btn-sm" onClick={async () => { const r = await fetch("/api/lab/carry-forward", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }) }).then((x) => x.json()).catch(() => ({ error: "Could not copy." })); setM(r.error || `Copied for ${r.students} student(s) ✓`); }}>Copy their old lab marks</button>}
  </div>;
}
