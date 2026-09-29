"use client";

import { useState, useEffect } from "react";

type Planned = {
  courseId: string; code: string; title: string; creditHours: number; courseType: string;
  nativeSemesterNumber: number; plannedSemesterNumber: number; hypotheticalGrade: string | null; currentlyEnrolled: boolean;
  isCriticalChain: boolean; chainDepth: number;
};
type CurrentEnrollment = { courseId: string; code: string; title: string; creditHours: number };
type Transcript = { courseCode: string; courseTitle: string; creditHours: number; termName: string; termYear: number; grade: string; gpaPoints: number | null };

export default function AdvisorStudentPlanner({ studentId }: { studentId: string }) {
  const [data, setData] = useState<{
    studentName: string; rollNumber: string; currentSemesterNumber: number;
    transcriptRecords: Transcript[]; currentEnrollments: CurrentEnrollment[]; planned: Planned[];
  } | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/advisor/students/${studentId}/degree-plan`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); return; }
      setData(json);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, [studentId]);

  async function dropEnrollment(courseId: string, code: string) {
    if (!confirm(`Drop ${code} from this student's current semester? This removes any marks already entered for it.`)) return;
    setBusyId(courseId); setError("");
    try {
      const res = await fetch(`/api/advisor/students/${studentId}/drop-enrollment`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function moveCourse(courseId: string, semesterNumber: number) {
    setBusyId(courseId); setError(""); setWarning("");
    try {
      const res = await fetch(`/api/advisor/students/${studentId}/degree-plan/move`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, semesterNumber }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      if (json.warning) setWarning(json.warning);
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  if (!data) return <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>;

  const semesterNumbers = Array.from(new Set(data.planned.map((p) => p.plannedSemesterNumber))).sort((a, b) => a - b);

  return (
    <div style={{ marginTop: 10, padding: 12, background: "#FAFAF8", border: "1px solid var(--line)" }}>
      {error && <div className="err">{error}</div>}
      {warning && <div style={{ background: "#FBEED2", color: "#96650F", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{warning}</div>}

      {data.currentEnrollments.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ fontSize: 12.5, marginBottom: 6 }}>Currently enrolled this semester</h4>
          {data.currentEnrollments.map((e) => (
            <div key={e.courseId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{e.code} — {e.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({e.creditHours} cr)</span></span>
              <button onClick={() => dropEnrollment(e.courseId, e.code)} disabled={busyId === e.courseId} className="btn" style={{ fontSize: 11, padding: "3px 9px", color: "var(--rust)" }}>
                Drop
              </button>
            </div>
          ))}
        </div>
      )}

      {data.transcriptRecords.some((t) => t.gpaPoints !== null && t.gpaPoints < 2) && (
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ fontSize: 12.5, marginBottom: 6 }}>Past courses eligible for improvement</h4>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 6 }}>Low grades from the transcript — pick a future semester below in the plan to schedule a retake.</p>
          {data.transcriptRecords.filter((t) => t.gpaPoints !== null && t.gpaPoints < 2).map((t) => (
            <div key={t.courseCode} style={{ fontSize: 12, padding: "3px 0" }}>
              {t.courseCode} — {t.courseTitle} <b style={{ color: "var(--rust)" }}>{t.grade}</b> <span style={{ color: "var(--slate)", fontSize: 11 }}>({t.termName} {t.termYear})</span>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ fontSize: 12.5, marginBottom: 6 }}>Future plan</h4>
      {semesterNumbers.map((semNum) => {
        const coursesHere = data.planned.filter((p) => p.plannedSemesterNumber === semNum);
        return (
          <div key={semNum} style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Semester {semNum}{semNum === data.currentSemesterNumber ? " (current)" : ""}</p>
            {coursesHere.map((c) => (
              <div key={c.courseId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--line)", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12 }}>
                  {c.isCriticalChain && <span title="Critical chain — no room to slip without delaying graduation" style={{ color: "var(--rust)", marginRight: 4 }}>⚠</span>}
                  {c.code} — {c.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({c.creditHours} cr, {c.courseType})</span>
                  {c.currentlyEnrolled && <span className="badge badge-ok" style={{ marginLeft: 6, fontSize: 9.5 }}>Enrolled</span>}
                </span>
                <select
                  value={c.plannedSemesterNumber} disabled={busyId === c.courseId || c.currentlyEnrolled}
                  onChange={(e) => moveCourse(c.courseId, parseInt(e.target.value, 10))}
                  style={{ fontSize: 11, padding: "2px 4px", border: "1px solid var(--line)" }}
                >
                  {Array.from({ length: 8 }, (_, i) => i + 1).filter((n) => n >= data.currentSemesterNumber).map((n) => (
                    <option key={n} value={n}>Sem {n}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
