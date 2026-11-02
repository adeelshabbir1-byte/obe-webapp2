"use client";
import { useState } from "react";
import { SCALE } from "../lib/cloSelfCore";

export default function CloSelfForm({ course, clos }: { course: { id: string; code: string; title: string }; clos: { code: string; statement: string; rating: number | null }[] }) {
  const [r, setR] = useState<Record<string, number>>(Object.fromEntries(clos.filter((c) => c.rating).map((c) => [c.code, c.rating!])));
  const [m, setM] = useState("");
  return (
    <div className="card" data-clo-self={course.id}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{course.code} {course.title}</h3>
      {clos.map((c) => (
        <div key={c.code} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13.5 }}><b>{c.code}</b> {c.statement}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{SCALE.map(([v, label]) => <button key={v} type="button" onClick={() => setR({ ...r, [c.code]: v })} className={r[c.code] === v ? "btn btn-sm" : "btn btn-secondary btn-sm"} aria-pressed={r[c.code] === v}>{label}</button>)}</div>
        </div>
      ))}
      <button type="button" className="btn" onClick={async () => { const res = await fetch("/api/student/clo-self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, ratings: r }) }); const d = await res.json().catch(() => ({})); setM(res.ok ? "Saved — thank you." : d.error || "Could not save."); }}>Save</button> <span className="small-note">{m}</span>
    </div>
  );
}
