"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
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
  const [rollNumbersToAdd, setRollNumbersToAdd] = useState("");
  const [addResult, setAddResult] = useState("");

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

  async function addByRollNumbers() {
    if (!rollNumbersToAdd.trim()) return;
    setLoading(true); setError(""); setAddResult("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/marks/enrollment`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rollNumbers: rollNumbersToAdd }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setAddResult(`Added ${data.added} student(s).${data.notFound ? ` Not found: ${data.notFound.join(", ")}` : ""}`);
      setRollNumbersToAdd(""); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function dropStudent(studentId: string, name: string) {
    if (!confirm(`Drop ${name} from this course? This also removes any marks already entered for them.`)) return;
    setLoading(true); setError("");
    await fetch(`/api/instructor/courses/${courseId}/marks/enrollment`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId }),
    });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {hasUnenrolledBatchStudents && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <p style={{ fontSize: 12.5, color: "var(--brass-dark)", marginBottom: 8 }}>Some students in this course's batch aren't enrolled yet (likely added after the course was offered).</p>
          <button onClick={autoEnroll} disabled={loading} className="btn btn-brass" style={{ padding: "6px 12px", fontSize: 12 }}>{loading ? "Enrolling…" : "Enroll All Batch Students"}</button>
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Add Students by Roll Number</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>
          Useful for adding a student from a different batch (repeat), or anyone not auto-enrolled. One roll number per line or comma-separated — their details are pulled from the existing student records.
        </p>
        {addResult && <div style={{ background: "#CCFBF1", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{addResult}</div>}
        <textarea value={rollNumbersToAdd} onChange={(e) => setRollNumbersToAdd(e.target.value)} rows={2} placeholder={"2026-CS-045\n2026-CS-046"} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", fontFamily: "monospace", fontSize: 12.5, marginBottom: 8 }} />
        <button onClick={addByRollNumbers} disabled={loading || !rollNumbersToAdd.trim()} className="btn btn-brass" style={{ padding: "6px 12px", fontSize: 12 }}>{loading ? "Adding…" : "Add Students"}</button>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {instruments.length === 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No assessment instruments defined yet — go to the Assessments tab first.</p>}
        {students.length === 0 && instruments.length > 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No students enrolled yet.</p>}
        {students.length > 0 && instruments.length > 0 && (
          <SortableTable style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ width: 140 }}>Name</th><th style={{ width: 90 }}>Roll #</th>
                {instruments.map((i) => <th key={i.id} style={{ textAlign: "center", fontSize: 10.5 }}>{i.type} {i.label}<br /><span style={{ fontWeight: 400, color: "var(--slate)" }}>/{i.maxScore}</span></th>)}
                <th style={{ width: 60 }}></th>
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
                  <td><button onClick={() => dropStudent(s.id, s.name)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Drop</button></td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        )}
      </div>
    </>
  );
}
