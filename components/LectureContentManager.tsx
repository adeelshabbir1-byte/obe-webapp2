"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { colorForTopic } from "../lib/topicColor";

type Clo = { id: string; code: string };
type Row = { id: string; week: number; lectureNumber: number; topic: string; subtopic: string | null; cloId: string | null; bloomLevel: string | null; weightPct: number };

const BLOOM_OPTIONS = ["", "C1", "C2", "C3", "C4", "C5", "C6"];

// Each cell edit updates only its own row's local state from the PATCH
// response, instead of router.refresh() re-fetching all 32 rows (plus
// the course's full CLO list) on every single blur/change event.
export default function LectureContentManager({ courseId, initialRows, clos, apiBase, generateEndpoint }: {
  courseId: string; initialRows: Row[]; clos: Clo[]; apiBase: string; generateEndpoint: string;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError("");
    try {
      const res = await fetch(generateEndpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRows(data.rows || []);
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveField(row: Row, field: "topic" | "subtopic" | "cloId" | "bloomLevel", value: string) {
    setBusyRow(row.id); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/lecture/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: field === "topic" ? value : row.topic,
          subtopic: field === "subtopic" ? value : row.subtopic,
          cloId: (field === "cloId" ? value : row.cloId) || null,
          bloomLevel: (field === "bloomLevel" ? value : row.bloomLevel) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyRow(null); return; }
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, topic: data.row.topic, subtopic: data.row.subtopic, cloId: data.row.cloId, bloomLevel: data.row.bloomLevel } : r));
      setBusyRow(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyRow(null); }
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Generate the lecture schedule</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          Creates 32 rows (2 lectures per week), pre-filled from the HEC curriculum where available — all fully editable.
        </p>
        {error && <div className="err">{error}</div>}
        <button onClick={generate} disabled={loading} className="btn btn-ai">{loading ? "Generating…" : "Generate 32-Lecture Template"}</button>
      </div>
    );
  }

  const filledCount = rows.filter((r) => r.topic.trim().length > 0).length;

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14 }}>Lecture Content</h3>
          <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{filledCount} / {rows.length} topics filled in — click any cell to edit</span>
        </div>
        <SortableTable paginate={false} style={{ tableLayout: "fixed" }}>
          <thead>
            <tr><th style={{ width: 40 }}>Wk</th><th style={{ width: 40 }}>Lec</th><th style={{ width: "26%" }}>Topic</th><th style={{ width: "26%" }}>Sub Topic</th><th style={{ width: 90 }}>CLO</th><th style={{ width: 90 }}>Bloom</th><th style={{ width: 70 }}>Weight</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ color: "var(--slate)", fontSize: 12 }}>{r.week}</td>
                <td style={{ color: "var(--slate)", fontSize: 12 }}>{r.lectureNumber}</td>
                <td style={{ background: colorForTopic(r.topic), padding: 0 }}>
                  <input
                    defaultValue={r.topic} disabled={busyRow === r.id} placeholder="Topic..."
                    onBlur={(e) => { if (e.target.value !== r.topic) saveField(r, "topic", e.target.value); }}
                    style={{ width: "100%", padding: "8px 9px", border: "none", background: "transparent", fontSize: 12.5 }}
                  />
                </td>
                <td style={{ padding: 0 }}>
                  <input
                    defaultValue={r.subtopic || ""} disabled={busyRow === r.id} placeholder="Sub topic..."
                    onBlur={(e) => { if (e.target.value !== (r.subtopic || "")) saveField(r, "subtopic", e.target.value); }}
                    style={{ width: "100%", padding: "8px 9px", border: "none", background: "transparent", fontSize: 12.5 }}
                  />
                </td>
                <td style={{ padding: 0 }}>
                  <select
                    defaultValue={r.cloId || ""} disabled={busyRow === r.id}
                    onChange={(e) => saveField(r, "cloId", e.target.value)}
                    style={{ width: "100%", padding: "8px 6px", border: "none", background: "transparent", fontSize: 12 }}
                  >
                    <option value="">—</option>
                    {clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </td>
                <td style={{ padding: 0 }}>
                  <select
                    defaultValue={r.bloomLevel || ""} disabled={busyRow === r.id}
                    onChange={(e) => saveField(r, "bloomLevel", e.target.value)}
                    style={{ width: "100%", padding: "8px 6px", border: "none", background: "transparent", fontSize: 12 }}
                  >
                    {BLOOM_OPTIONS.map((b) => <option key={b} value={b}>{b || "—"}</option>)}
                  </select>
                </td>
                <td style={{ fontWeight: 600, fontSize: 12 }}>{r.weightPct}%</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          Same-colored topics repeat across rows — a quick visual check that related lectures are grouped together.
          Set which quizzes/assignments/exam questions test each topic on the Assessments tab (Weight column fills in from there).
        </p>
      </div>
    </>
  );
}
