"use client";

import { useState } from "react";

type Instrument = { id: string; type: string; label: string; maxScore: number }; // id here is the SLOT key (type::label)
type Student = { id: string; name: string; rollNumber: string; isRepeat: boolean; marks: Record<string, number> };
type Section = { courseId: string; sectionLabel: string; sectionFullLabel: string; students: Student[] };

export default function CombinedMarksEntryManager({ instruments, sections: initialSections, instrumentIdBySlot }: {
  instruments: Instrument[]; sections: Section[]; instrumentIdBySlot: Record<string, Record<string, string>>;
}) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [error, setError] = useState("");
  const [busyCell, setBusyCell] = useState<string | null>(null);

  async function saveScore(courseId: string, studentId: string, slotKey: string, value: string, inputEl: HTMLInputElement, previousValue: number | null) {
    const instrumentId = instrumentIdBySlot[courseId]?.[slotKey];
    if (!instrumentId) { setError("This section doesn't have a matching instrument for this column yet."); return; }
    const key = studentId + slotKey;
    setBusyCell(key); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/marks`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, instrumentId, score: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        inputEl.value = previousValue !== null ? String(previousValue) : "";
        inputEl.style.borderColor = "var(--rust)"; setTimeout(() => { inputEl.style.borderColor = ""; }, 1500);
        setBusyCell(null); return;
      }
      setSections((prev) => prev.map((sec) => sec.courseId !== courseId ? sec : {
        ...sec, students: sec.students.map((s) => s.id === studentId ? { ...s, marks: { ...s.marks, [slotKey]: data.mark.score } } : s),
      }));
      setBusyCell(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyCell(null); }
  }

  const totalStudents = sections.reduce((s, sec) => s + sec.students.length, 0);

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        All {totalStudents} students across your {sections.length} section(s), in one roster. Columns are matched across
        sections by assessment type and label — if a section's instruments don't match up with this course's, that
        cell won't be editable here until they're synced (see the Weights tab).
      </p>
      {error && <div className="err">{error}</div>}
      {instruments.length === 0 ? (
        <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No assessment instruments defined yet.</p>
      ) : (
        <table style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Roll #</th><th style={{ width: 140 }}>Name</th><th style={{ width: 70 }}>Section</th>
              {instruments.map((i) => <th key={i.id} style={{ textAlign: "center", fontSize: 10.5 }}>{i.type} {i.label}<br /><span style={{ fontWeight: 400, color: "var(--slate)" }}>/{i.maxScore}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => sec.students.map((s) => (
              <tr key={s.id}>
                <td>{s.rollNumber}</td>
                <td>{s.name}{s.isRepeat && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Repeat</span>}</td>
                <td style={{ fontSize: 11.5, color: "var(--slate)", fontWeight: 600 }} title={sec.sectionFullLabel}>{sec.sectionLabel}</td>
                {instruments.map((i) => {
                  const key = s.id + i.id;
                  const hasMatch = !!instrumentIdBySlot[sec.courseId]?.[i.id];
                  return (
                    <td key={i.id} style={{ textAlign: "center", background: !hasMatch ? "#F3F6FD" : undefined }}>
                      {hasMatch ? (
                        <input
                          type="number" min={0} max={i.maxScore} defaultValue={s.marks[i.id] ?? ""} disabled={busyCell === key}
                          onBlur={(e) => { const v = e.target.value; if (v !== "" && Number(v) !== s.marks[i.id]) saveScore(sec.courseId, s.id, i.id, v, e.target, s.marks[i.id] ?? null); }}
                          style={{ width: 50, padding: "4px 5px", border: "1px solid var(--line)", textAlign: "center", fontSize: 12 }}
                        />
                      ) : (
                        <span style={{ fontSize: 10.5, color: "var(--slate)" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            )))}
          </tbody>
        </table>
      )}
    </div>
  );
}
