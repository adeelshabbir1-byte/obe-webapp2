"use client";

import { useEffect, useState } from "react";

// On the Student Directory: a batch over the section limit is split into Section A, B, … (the same students in every
// course). Students are placed by roll number, evenly; move one here. Shown only when the batch has more than one section.
type Sec = { label: string; size: number; students: number };
export default function StudentSectionsPanel({ batchId, students }: { batchId: string; students: { id: string; name: string; rollNumber: string }[] }) {
  const [data, setData] = useState<{ max: number; sections: Sec[]; sectionOf: Record<string, string> } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const load = async () => { const r = await fetch(`/api/coordinator/student-sections?batchId=${batchId}`); if (r.ok) setData(await r.json()); };
  useEffect(() => { load(); }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || data.sections.length < 2) return null;
  async function move(studentId: string, label: string) {
    setMsg(null);
    const r = await fetch("/api/coordinator/student-sections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, studentId, label }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: d.message } : { ok: false, text: d.error || "Could not move." });
    load();
  }
  const shown = students.filter((s) => !q || `${s.rollNumber} ${s.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Student sections</h3>
      <p className="small-note" style={{ marginTop: 0 }}>This batch is taught in {data.sections.length} sections of at most {data.max} students — the same section in every course. Students are placed by roll number; move anyone below.</p>
      <p style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 8px" }}>{data.sections.map((s) => <span key={s.label} className="badge badge-neutral">Section {s.label}: {s.students} placed · planned {s.size}</span>)}</p>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Who is in which section ({students.length})</summary>
        <input placeholder="Find by roll number or name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: "8px 0", minWidth: 260 }} aria-label="Find a student" />
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Roll number</th><th>Name</th><th>Section</th></tr></thead>
          <tbody>{shown.slice(0, 300).map((s) => (
            <tr key={s.id}><td>{s.rollNumber}</td><td>{s.name}</td>
              <td><select value={data.sectionOf[s.id] || ""} onChange={(e) => move(s.id, e.target.value)} aria-label={`Section of ${s.name}`}>
                {!data.sectionOf[s.id] && <option value="">—</option>}
                {data.sections.map((x) => <option key={x.label} value={x.label}>Section {x.label}</option>)}
              </select></td></tr>))}</tbody></table>
      </details>
    </div>
  );
}
