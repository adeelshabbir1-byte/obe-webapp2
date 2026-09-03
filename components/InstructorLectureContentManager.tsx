"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { colorForTopic } from "../lib/topicColor";

type Clo = { id: string; code: string };
type Row = { id: string; week: number; lectureNumber: number; topic: string; subtopic: string | null; cloId: string | null; bloomLevel: string | null; weightPct: number; actualDate: string | null; seTopic: string };

const BLOOM_OPTIONS = ["", "C1", "C2", "C3", "C4", "C5", "C6"];

export default function InstructorLectureContentManager({ courseId, initialRows, clos }: { courseId: string; initialRows: Row[]; clos: Clo[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);

  async function autoFillDates() {
    setAutoFilling(true); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/lecture/auto-fill-dates`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setAutoFilling(false); return; }
      setAutoFilling(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setAutoFilling(false); }
  }

  async function saveField(row: Row, patch: Partial<{ topic: string; subtopic: string; cloId: string; bloomLevel: string; actualDate: string }>) {
    setBusyRow(row.id); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/lecture/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: patch.topic ?? row.topic, subtopic: patch.subtopic ?? row.subtopic,
          cloId: (patch.cloId ?? row.cloId) || null, bloomLevel: (patch.bloomLevel ?? row.bloomLevel) || null,
          actualDate: patch.actualDate ?? row.actualDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyRow(null); return; }
      setBusyRow(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyRow(null); }
  }

  const filledCount = initialRows.filter((r) => r.actualDate).length;

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14 }}>Lecture Content — Actual Delivery</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{filledCount} / {initialRows.length} lectures dated</span>
            <button onClick={autoFillDates} disabled={autoFilling} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>
              {autoFilling ? "Filling…" : "Auto-fill Dates"}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10, marginTop: -4 }}>
          Set lectures 1 and 2's dates below first, then click Auto-fill — the rest follow the same weekly pattern,
          skipping holidays and this course's exam dates. Any date you've already changed stays as you set it.
        </p>
        <table style={{ tableLayout: "fixed" }}>
          <thead>
            <tr><th style={{ width: 34 }}>Wk</th><th style={{ width: 34 }}>Lec</th><th style={{ width: "16%" }}>Planned Topic</th><th style={{ width: "20%" }}>Actual Topic</th><th style={{ width: "16%" }}>Sub Topic</th><th style={{ width: 110 }}>Actual Date</th><th style={{ width: 80 }}>CLO</th><th style={{ width: 80 }}>Bloom</th><th style={{ width: 60 }}>Weight</th></tr>
          </thead>
          <tbody>
            {initialRows.map((r) => (
              <tr key={r.id}>
                <td style={{ color: "var(--slate)", fontSize: 12 }}>{r.week}</td>
                <td style={{ color: "var(--slate)", fontSize: 12 }}>{r.lectureNumber}</td>
                <td style={{ color: "var(--slate)", fontSize: 11.5 }}>{r.seTopic || "—"}</td>
                <td style={{ background: colorForTopic(r.topic), padding: 0 }}>
                  <input defaultValue={r.topic} disabled={busyRow === r.id} placeholder="Actual topic..."
                    onBlur={(e) => { if (e.target.value !== r.topic) saveField(r, { topic: e.target.value }); }}
                    style={{ width: "100%", padding: "8px 9px", border: "none", background: "transparent", fontSize: 12.5 }} />
                </td>
                <td style={{ padding: 0 }}>
                  <input defaultValue={r.subtopic || ""} disabled={busyRow === r.id} placeholder="Sub topic..."
                    onBlur={(e) => { if (e.target.value !== (r.subtopic || "")) saveField(r, { subtopic: e.target.value }); }}
                    style={{ width: "100%", padding: "8px 9px", border: "none", background: "transparent", fontSize: 12.5 }} />
                </td>
                <td style={{ padding: 0 }}>
                  <input type="date" defaultValue={r.actualDate ? r.actualDate.slice(0, 10) : ""} disabled={busyRow === r.id}
                    onBlur={(e) => { if (e.target.value !== (r.actualDate ? r.actualDate.slice(0, 10) : "")) saveField(r, { actualDate: e.target.value }); }}
                    style={{ width: "100%", padding: "6px 6px", border: "none", background: "transparent", fontSize: 11.5 }} />
                </td>
                <td style={{ padding: 0 }}>
                  <select defaultValue={r.cloId || ""} disabled={busyRow === r.id} onChange={(e) => saveField(r, { cloId: e.target.value })}
                    style={{ width: "100%", padding: "8px 6px", border: "none", background: "transparent", fontSize: 12 }}>
                    <option value="">—</option>
                    {clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </td>
                <td style={{ padding: 0 }}>
                  <select defaultValue={r.bloomLevel || ""} disabled={busyRow === r.id} onChange={(e) => saveField(r, { bloomLevel: e.target.value })}
                    style={{ width: "100%", padding: "8px 6px", border: "none", background: "transparent", fontSize: 12 }}>
                    {BLOOM_OPTIONS.map((b) => <option key={b} value={b}>{b || "—"}</option>)}
                  </select>
                </td>
                <td style={{ fontWeight: 600, fontSize: 12 }}>{r.weightPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
