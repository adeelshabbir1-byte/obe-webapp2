"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Clo = { id: string; code: string };
type Row = { id: string; week: number; lectureNumber: number; topic: string; subtopic: string | null; cloId: string | null; cloCode: string | null; bloomLevel: string | null; weightPct: number };

const BLOOM_OPTIONS = ["", "C1", "C2", "C3", "C4", "C5", "C6"];

export default function LectureScheduleManager({ courseId, initialRows, clos }: { courseId: string; initialRows: Row[]; clos: Clo[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/lecture/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveRow(e: React.FormEvent<HTMLFormElement>, rowId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/lecture/${rowId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: fd.get("topic"), subtopic: fd.get("subtopic"),
          cloId: fd.get("cloId") || null, bloomLevel: fd.get("bloomLevel") || null, weightPct: fd.get("weightPct") || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (initialRows.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Generate the lecture schedule</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          Creates 32 rows (2 lectures per week) with Week and Lecture # already filled in. You then fill in
          Topic, Sub Topic, CLO, Bloom level, and Weight for each — same as the Excel template.
        </p>
        {error && <div className="err">{error}</div>}
        <button onClick={generate} disabled={loading} className="btn btn-brass">{loading ? "Generating…" : "Generate 32-Lecture Template"}</button>
      </div>
    );
  }

  const filledCount = initialRows.filter((r) => r.topic.trim().length > 0).length;

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14 }}>Lecture Schedule</h3>
          <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{filledCount} / {initialRows.length} rows filled in</span>
        </div>
        <table>
          <thead><tr><th>Wk</th><th>Lec</th><th>Topic</th><th>Sub Topic</th><th>CLO</th><th>Bloom</th><th>Weight</th><th></th></tr></thead>
          <tbody>
            {initialRows.map((r) => editingId === r.id ? (
              <tr key={r.id}>
                <td colSpan={8}>
                  <form onSubmit={(e) => saveRow(e, r.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Wk {r.week} · Lec {r.lectureNumber}</span>
                    <input name="topic" defaultValue={r.topic} placeholder="Topic" style={{ flex: "1 1 160px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="subtopic" defaultValue={r.subtopic || ""} placeholder="Sub topic" style={{ flex: "1 1 160px", padding: "6px 8px", border: "1px solid var(--line)" }} />
                    <select name="cloId" defaultValue={r.cloId || ""} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                      <option value="">— CLO —</option>
                      {clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                    <select name="bloomLevel" defaultValue={r.bloomLevel || ""} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                      {BLOOM_OPTIONS.map((b) => <option key={b} value={b}>{b || "—"}</option>)}
                    </select>
                    <input name="weightPct" type="number" min={0} max={100} defaultValue={r.weightPct} style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} placeholder="%" />
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{r.week}</td><td>{r.lectureNumber}</td>
                <td style={{ color: r.topic ? "var(--ink)" : "var(--slate)" }}>{r.topic || "—"}</td>
                <td>{r.subtopic || "—"}</td><td>{r.cloCode || "—"}</td><td>{r.bloomLevel || "—"}</td><td>{r.weightPct}%</td>
                <td><button onClick={() => setEditingId(r.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
