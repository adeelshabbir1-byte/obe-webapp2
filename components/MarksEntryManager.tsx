"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Instrument = { id: string; type: string; label: string; maxScore: number };
type Student = { id: string; name: string; rollNumber: string; isRepeat: boolean; marks: Record<string, number> };

export default function MarksEntryManager({ courseId, instruments, students, hasUnenrolledBatchStudents }: {
  courseId: string; instruments: Instrument[]; students: Student[]; hasUnenrolledBatchStudents: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function saveScore(studentId: string, instrumentId: string, value: string) {
    const key = studentId + instrumentId;
    setBusyCell(key); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/marks`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, instrumentId, score: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyCell(null); return; }
      setBusyCell(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyCell(null); }
  }

  async function autoEnroll() {
    setLoading(true); setError("");
    const res = await fetch(`/api/instructor/courses/${courseId}/marks/auto-enroll`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Something went wrong.");
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {hasUnenrolledBatchStudents && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <p style={{ fontSize: 12.5, color: "var(--brass-dark)", marginBottom: 8 }}>Some students in this course's batch aren't enrolled yet.</p>
          <button onClick={autoEnroll} disabled={loading} className="btn btn-brass" style={{ padding: "6px 12px", fontSize: 12 }}>{loading ? "Enrolling…" : "Enroll All Batch Students"}</button>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        {instruments.length === 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No assessment instruments defined yet — go to the Assessments tab first.</p>}
        {students.length === 0 && instruments.length > 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No students enrolled yet.</p>}
        {students.length > 0 && instruments.length > 0 && (
          <table style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ width: 140 }}>Name</th><th style={{ width: 90 }}>Roll #</th>
                {instruments.map((i) => <th key={i.id} style={{ textAlign: "center", fontSize: 10.5 }}>{i.type} {i.label}<br /><span style={{ fontWeight: 400, color: "var(--slate)" }}>/{i.maxScore}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}{s.isRepeat && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Repeat</span>}</td>
                  <td>{s.rollNumber}</td>
                  {instruments.map((i) => {
                    const key = s.id + i.id;
                    return (
                      <td key={i.id} style={{ textAlign: "center" }}>
                        <input
                          type="number" min={0} max={i.maxScore} defaultValue={s.marks[i.id] ?? ""} disabled={busyCell === key}
                          onBlur={(e) => { const v = e.target.value; if (v !== "" && Number(v) !== s.marks[i.id]) saveScore(s.id, i.id, v); }}
                          style={{ width: 50, padding: "4px 5px", border: "1px solid var(--line)", textAlign: "center", fontSize: 12 }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
