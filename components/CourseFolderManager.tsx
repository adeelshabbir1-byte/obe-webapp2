"use client";

import { useState } from "react";

type Row = { id: string; code: string; title: string; batch: string; kept: boolean; note: string };

export default function CourseFolderManager({ rows }: { rows: Row[] }) {
  const [list, setList] = useState(rows);
  const [msg, setMsg] = useState("");
  async function save(r: Row) {
    setMsg("");
    const res = await fetch("/api/coordinator/course-folders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: r.id, kept: r.kept, note: r.note }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error || "Something went wrong"); }
  }
  function change(id: string, patch: Partial<Row>, saveNow: boolean) {
    const next = list.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setList(next);
    if (saveNow) save(next.find((r) => r.id === id) as Row);
  }
  const kept = list.filter((r) => r.kept).length;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <p style={{ marginTop: 0 }}><b>{kept}</b> of {list.length} course folders kept. {msg && <span style={{ color: "#b3261e" }}>{msg}</span>}</p>
      <table>
        <thead><tr><th>Kept</th><th>Course</th><th>Batch</th><th>Where it is kept</th></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.id}>
            <td><input type="checkbox" checked={r.kept} onChange={(e) => change(r.id, { kept: e.target.checked }, true)} /></td>
            <td>{r.code} {r.title}</td><td>{r.batch}</td>
            <td><input value={r.note} placeholder="e.g. Room 12 cabinet, or LMS link" style={{ width: 260, padding: "5px 8px", border: "1px solid var(--line)" }}
              onChange={(e) => change(r.id, { note: e.target.value }, false)} onBlur={() => save(r)} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
