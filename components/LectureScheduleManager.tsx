"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Clo = { id: string; code: string };
type Instrument = { id: string; type: string; label: string; marksPct: number };
type Row = { id: string; week: number; lectureNumber: number; topic: string; subtopic: string | null; cloId: string | null; cloCode: string | null; bloomLevel: string | null; weightPct: number; linkedInstrumentIds: string[]; midtermQuestions: string; finalQuestions: string };

const BLOOM_OPTIONS = ["", "C1", "C2", "C3", "C4", "C5", "C6"];

export default function LectureScheduleManager({ courseId, initialRows, clos, instruments }: {
  courseId: string; initialRows: Row[]; clos: Clo[]; instruments: Instrument[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);

  const checkboxInstruments = instruments.filter((i) => i.type === "Quiz" || i.type === "Assignment");
  const hasMidterm = instruments.some((i) => i.type === "Midterm");
  const hasFinal = instruments.some((i) => i.type === "Final");

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
        body: JSON.stringify({ topic: fd.get("topic"), subtopic: fd.get("subtopic"), cloId: fd.get("cloId") || null, bloomLevel: fd.get("bloomLevel") || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function toggleInstrument(rowId: string, instrumentId: string, linked: boolean) {
    const key = rowId + instrumentId;
    setBusyCell(key);
    await fetch(`/api/subjectexpert/courses/${courseId}/lecture/${rowId}/instrument-toggle`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instrumentId, linked }),
    });
    setBusyCell(null); router.refresh();
  }

  async function saveQuestions(rowId: string, type: "Midterm" | "Final", value: string) {
    const key = rowId + type;
    setBusyCell(key); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/lecture/${rowId}/set-questions`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, numbers: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyCell(null); return; }
      setBusyCell(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyCell(null); }
  }

  if (initialRows.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Generate the lecture schedule</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          Creates 32 rows (2 lectures per week) with Week and Lecture # already filled in.
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
      {instruments.length === 0 && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <p style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>
            No quizzes, assignments, or exam questions defined yet — go to the "Quizzes/Assignments/Exams" tab first.
          </p>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14 }}>Lecture Schedule</h3>
          <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{filledCount} / {initialRows.length} rows filled in</span>
        </div>
        <SortableTable>
          <thead>
            <tr>
              <th>Wk</th><th>Lec</th><th>Topic</th><th>Sub Topic</th><th>CLO</th><th>Bloom</th>
              {checkboxInstruments.map((i) => (
                <th key={i.id} style={{ textAlign: "center", writingMode: "vertical-rl", transform: "rotate(180deg)", height: 80, whiteSpace: "nowrap", fontSize: 10.5 }}>
                  {i.type} {i.label}
                </th>
              ))}
              {hasMidterm && <th style={{ fontSize: 10.5 }}>Midterm Q#</th>}
              {hasFinal && <th style={{ fontSize: 10.5 }}>Final Q#</th>}
              <th>Weight</th><th></th>
            </tr>
          </thead>
          <tbody>
            {initialRows.map((r) => editingId === r.id ? (
              <tr key={r.id}>
                <td colSpan={7 + checkboxInstruments.length + (hasMidterm ? 1 : 0) + (hasFinal ? 1 : 0)}>
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
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{r.week}</td><td>{r.lectureNumber}</td>
                <td style={{ color: r.topic ? "var(--ink)" : "var(--slate)" }}>{r.topic || "—"}</td>
                <td>{r.subtopic || "—"}</td><td>{r.cloCode || "—"}</td><td>{r.bloomLevel || "—"}</td>
                {checkboxInstruments.map((i) => {
                  const checked = r.linkedInstrumentIds.includes(i.id);
                  const key = r.id + i.id;
                  return (
                    <td key={i.id} style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={checked} disabled={busyCell === key} onChange={(e) => toggleInstrument(r.id, i.id, e.target.checked)} />
                    </td>
                  );
                })}
                {hasMidterm && (
                  <td>
                    <input
                      defaultValue={r.midtermQuestions} placeholder="e.g. 1,3" disabled={busyCell === r.id + "Midterm"}
                      onBlur={(e) => { if (e.target.value !== r.midtermQuestions) saveQuestions(r.id, "Midterm", e.target.value); }}
                      style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12 }}
                    />
                  </td>
                )}
                {hasFinal && (
                  <td>
                    <input
                      defaultValue={r.finalQuestions} placeholder="e.g. 2" disabled={busyCell === r.id + "Final"}
                      onBlur={(e) => { if (e.target.value !== r.finalQuestions) saveQuestions(r.id, "Final", e.target.value); }}
                      style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12 }}
                    />
                  </td>
                )}
                <td style={{ fontWeight: 600 }}>{r.weightPct}%</td>
                <td><button onClick={() => setEditingId(r.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>
          For Midterm/Final, type the question number(s) this lecture is tested in (comma-separated for more than one), then click away to save.
          If a quiz, assignment, or question is linked to more than one lecture, its marks are split evenly across them (e.g. a 10%
          question linked to 2 lectures gives each one 5%).
        </p>
      </div>
    </>
  );
}
