"use client";

import { useState } from "react";

type Row = { id: string; code: string; title: string; batch: string; teacher?: string; kept: boolean; note: string; done?: number; missing?: string[] };

/** Each course's file: complete or what is missing, the PDF, the Excel folder sheet, and where a hard copy is kept. */
export default function CourseFolderManager({ rows }: { rows: Row[] }) {
  const [list, setList] = useState(rows);
  const [msg, setMsg] = useState("");
  async function save(r: Row) {
    setMsg("");
    const res = await fetch("/api/coordinator/course-folders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: r.id, kept: r.kept, note: r.note }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error || "Something went wrong"); }
  }
  const change = (id: string, note: string) => setList(list.map((r) => (r.id === id ? { ...r, note } : r)));
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {msg && <p style={{ marginTop: 0, color: "#b3261e" }}>{msg}</p>}
      <table className="table">
        <thead><tr><th>Course</th><th>Semester</th><th>Teacher</th><th>Course file</th><th>Download</th><th>Hard copy kept at</th></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.id}>
            <td><b>{r.code}</b> {r.title}</td><td>{r.batch}</td><td>{r.teacher || "—"}</td>
            <td style={{ minWidth: 220 }}>
              <span style={{ fontWeight: 700, color: r.kept ? "#1E6B3A" : "#B3261E" }}>{r.kept ? "✓ Complete" : `${r.done ?? 0} of 10 parts`}</span>
              {!r.kept && !!r.missing?.length && <div style={{ fontSize: 12, color: "var(--slate)" }}>Missing: {r.missing.join(", ")}</div>}
            </td>
            <td style={{ whiteSpace: "nowrap" }}><a className="btn btn-brass btn-sm" href={`/api/course-file?courseId=${r.id}`}>PDF</a> <a className="btn btn-secondary btn-sm" href={`/api/coordinator/course-folders/export?courseId=${r.id}`}>Excel</a></td>
            <td><input value={r.note} placeholder="e.g. Room 12 cabinet, or LMS link" aria-label={`Where the ${r.code} folder is kept`} style={{ width: 220, padding: "5px 8px", border: "1px solid var(--line)" }}
              onChange={(e) => change(r.id, e.target.value)} onBlur={() => save(r)} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
