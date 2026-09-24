"use client";

import { useState, useEffect, useMemo } from "react";

type Planned = {
  courseId: string; code: string; title: string; creditHours: number; courseType: string;
  nativeSemesterNumber: number; plannedSemesterNumber: number; hypotheticalGrade: string | null; currentlyEnrolled: boolean;
};
type Transcript = { courseCode: string; courseTitle: string; creditHours: number; termName: string; termYear: number; grade: string; gpaPoints: number | null };

export default function DegreePlanner() {
  const [data, setData] = useState<{
    currentSemesterNumber: number; minCreditsPerSemester: number; maxCreditsPerSemester: number;
    gradingScale: { letter: string; gpaValue: number }[]; transcriptRecords: Transcript[]; planned: Planned[];
  } | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/student/degree-plan");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); return; }
      setData(json);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function moveCourse(courseId: string, semesterNumber: number) {
    setBusyId(courseId); setError(""); setWarning("");
    try {
      const res = await fetch("/api/student/degree-plan/move", {
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
      const res = await fetch("/api/student/degree-plan/hypothetical-grade", {
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

  if (!data) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading…</p>;

  const semesterNumbers = Array.from(new Set(data.planned.map((p) => p.plannedSemesterNumber))).sort((a, b) => a - b);
  const transcriptByTerm = new Map<string, Transcript[]>();
  for (const t of data.transcriptRecords) {
    const key = `${t.termName} ${t.termYear}`;
    transcriptByTerm.set(key, [...(transcriptByTerm.get(key) || []), t]);
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {warning && <div style={{ background: "#FBEED2", color: "#96650F", padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{warning}</div>}

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 14 }}>Cumulative GPA</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)" }}>Real grades from your transcript, plus any hypothetical grades you've set below.</p>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--brass-dark)" }}>{cgpa ?? "—"}</div>
      </div>

      {transcriptByTerm.size > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Completed</h3>
          {Array.from(transcriptByTerm.entries()).map(([term, records]) => (
            <div key={term} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{term}</p>
              {records.map((t) => (
                <div key={t.courseCode} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                  <span>{t.courseCode} — {t.courseTitle} <span style={{ color: "var(--slate)", fontSize: 11 }}>({t.creditHours} cr)</span></span>
                  <b>{t.grade}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {semesterNumbers.map((semNum) => {
        const coursesHere = data.planned.filter((p) => p.plannedSemesterNumber === semNum);
        const creditTotal = coursesHere.reduce((sum, c) => sum + c.creditHours, 0);
        const overLimit = creditTotal > data.maxCreditsPerSemester;
        const underLimit = creditTotal < data.minCreditsPerSemester && semNum === data.currentSemesterNumber;
        const isCurrent = semNum === data.currentSemesterNumber;
        const isPast = semNum < data.currentSemesterNumber;

        return (
          <div key={semNum} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 14 }}>
                Semester {semNum}{isCurrent ? " (current)" : isPast ? "" : ""}
              </h3>
              <span style={{ fontSize: 12, color: overLimit || underLimit ? "var(--rust)" : "var(--slate)" }}>
                {creditTotal} credit hour{creditTotal === 1 ? "" : "s"}
                {overLimit && ` — over your ${data.maxCreditsPerSemester}-credit limit`}
                {underLimit && ` — under your ${data.minCreditsPerSemester}-credit minimum`}
              </span>
            </div>
            {coursesHere.map((c) => (
              <div key={c.courseId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5 }}>
                  {c.code} — {c.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({c.creditHours} cr, {c.courseType})</span>
                  {c.currentlyEnrolled && <span className="badge badge-ok" style={{ marginLeft: 6, fontSize: 9.5 }}>Enrolled</span>}
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
