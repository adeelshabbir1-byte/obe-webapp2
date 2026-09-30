"use client";

import { useState, useEffect, useMemo } from "react";

type Planned = {
  courseId: string; code: string; title: string; creditHours: number; courseType: string;
  nativeSemesterNumber: number; plannedSemesterNumber: number; hypotheticalGrade: string | null; currentlyEnrolled: boolean;
  isCriticalChain: boolean; chainDepth: number;
};
type CurrentEnrollment = { courseId: string; code: string; title: string; creditHours: number };
type Transcript = { courseCode: string; courseTitle: string; creditHours: number; termName: string; termYear: number; grade: string; gpaPoints: number | null };

export default function AdvisorStudentPlanner({ studentId }: { studentId: string }) {
  const [data, setData] = useState<{
    currentSemesterNumber: number; gradingScale: { letter: string; gpaValue: number }[];
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

  async function setHypotheticalGrade(courseId: string, grade: string) {
    setBusyId(courseId); setError("");
    try {
      const res = await fetch(`/api/advisor/students/${studentId}/degree-plan/hypothetical-grade`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, grade: grade || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  const cgpa = useMemo(() => {
    if (!data) return null;
    let totalPoints = 0, totalCredits = 0;
    for (const t of data.transcriptRecords) {
      if (t.gpaPoints === null) continue;
      totalPoints += t.gpaPoints * t.creditHours; totalCredits += t.creditHours;
    }
    for (const p of data.planned) {
      if (!p.hypotheticalGrade) continue;
      const scaleEntry = data.gradingScale.find((g) => g.letter === p.hypotheticalGrade);
      if (!scaleEntry) continue;
      totalPoints += scaleEntry.gpaValue * p.creditHours; totalCredits += p.creditHours;
    }
    return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : null;
  }, [data]);

  if (!data) return <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>;

  const semesterNumbers = Array.from(new Set(data.planned.map((p) => p.plannedSemesterNumber))).sort((a, b) => a - b);
  const takenCodes = new Set(data.transcriptRecords.map((t) => t.courseCode));
  const registerNow = data.planned
    .filter((p) => !p.currentlyEnrolled && p.plannedSemesterNumber <= data.currentSemesterNumber)
    .sort((a, b) => (Number(b.isCriticalChain) - Number(a.isCriticalChain)) || (a.plannedSemesterNumber - b.plannedSemesterNumber) || (b.chainDepth - a.chainDepth));

  return (
    <div style={{ marginTop: 10, padding: 12, background: "#FAFAF8", border: "1px solid var(--line)" }}>
      {error && <div className="err">{error}</div>}
      {warning && <div style={{ background: "#FBEED2", color: "#96650F", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{warning}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "8px 10px", background: "#fff", border: "1px solid var(--line)" }}>
        <div>
          <b style={{ fontSize: 12.5 }}>Projected CGPA</b>
          <p style={{ fontSize: 11, color: "var(--slate)" }}>Real transcript grades, plus any hypothetical retake grades set below.</p>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--brass-dark)" }}>{cgpa ?? "—"}</div>
      </div>

      {registerNow.length > 0 && (
        <div style={{ marginBottom: 14, padding: "8px 10px", background: "#fff", border: "1px solid var(--line)" }}>
          <h4 style={{ fontSize: 12.5, marginBottom: 2 }}>Recommended: Register For These Now</h4>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 6 }}>
            Due this semester or already overdue, and not yet enrolled — advise on these when this semester's
            registration opens.
          </p>
          {registerNow.map((c) => (
            <div key={c.courseId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{c.code} — {c.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({c.creditHours} cr)</span></span>
              {c.plannedSemesterNumber < data.currentSemesterNumber ? (
                <span className="badge" style={{ fontSize: 9.5, background: "#FBEAEA", color: "var(--rust)" }}>Overdue</span>
              ) : c.isCriticalChain ? (
                <span className="badge" style={{ fontSize: 9.5, background: "#FBEAEA", color: "var(--rust)" }}>⚠ Critical</span>
              ) : (
                <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>This semester</span>
              )}
            </div>
          ))}
        </div>
      )}

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

      {data.transcriptRecords.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ fontSize: 12.5, marginBottom: 6 }}>Transcript (completed courses)</h4>
          {data.transcriptRecords.map((t, i) => (
            <div key={`${t.courseCode}-${i}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{t.courseCode} — {t.courseTitle} <span style={{ color: "var(--slate)", fontSize: 11 }}>({t.creditHours} cr, {t.termName} {t.termYear})</span></span>
              <b style={{ color: t.gpaPoints !== null && t.gpaPoints < 2 ? "var(--rust)" : "inherit" }}>{t.grade}</b>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 6 }}>
            To improve a low grade: find that same course code in the Future Plan below (add it if it isn't
            already there by moving it to a future semester), then set a hypothetical grade on it to see the
            projected effect on CGPA.
          </p>
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
                  {takenCodes.has(c.code) && <span className="badge badge-warn" style={{ marginLeft: 6, fontSize: 9.5 }}>Retake/Improvement</span>}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={c.plannedSemesterNumber} disabled={busyId === c.courseId || c.currentlyEnrolled}
                    onChange={(e) => moveCourse(c.courseId, parseInt(e.target.value, 10))}
                    style={{ fontSize: 11, padding: "2px 4px", border: "1px solid var(--line)" }}
                  >
                    {Array.from({ length: 8 }, (_, i) => i + 1).filter((n) => n >= data.currentSemesterNumber).map((n) => (
                      <option key={n} value={n}>Sem {n}</option>
                    ))}
                  </select>
                  <select
                    value={c.hypotheticalGrade || ""} disabled={busyId === c.courseId}
                    onChange={(e) => setHypotheticalGrade(c.courseId, e.target.value)}
                    style={{ fontSize: 11, padding: "2px 4px", border: "1px solid var(--line)" }}
                  >
                    <option value="">Grade?</option>
                    {data.gradingScale.map((g) => <option key={g.letter} value={g.letter}>{g.letter}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
