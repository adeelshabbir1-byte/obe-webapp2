"use client";

import { useState, useEffect, useMemo } from "react";
import DegreeSchemeBoard from "./DegreeSchemeBoard";

type Planned = {
  courseId: string; code: string; title: string; creditHours: number; courseType: string;
  nativeSemesterNumber: number; plannedSemesterNumber: number; hypotheticalGrade: string | null; currentlyEnrolled: boolean;
  isCriticalChain: boolean; chainDepth: number;
};
type Transcript = { courseCode: string; courseTitle: string; creditHours: number; termName: string; termYear: number; grade: string; gpaPoints: number | null };
type SuggestedCourse = {
  courseId: string; code: string; title: string; creditHours: number; courseType: string;
  nativeSemesterNumber: number | null; suggestedSemesterNumber: number;
  isRetake: boolean; offeringConfirmed: boolean; overCredit: boolean;
};
type SuggestedSchedule = {
  minCreditsPerSemester: number; maxCreditsPerSemester: number; currentSemesterNumber: number;
  bySemester: { semesterNumber: number; termLabel: string; totalCredits: number; courses: SuggestedCourse[] }[];
};

export default function DegreePlanner() {
  const [data, setData] = useState<{
    currentSemesterNumber: number; minCreditsPerSemester: number; maxCreditsPerSemester: number;
    gradingScale: { letter: string; gpaValue: number }[]; transcriptRecords: Transcript[]; planned: Planned[];
  } | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestedSchedule | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [boardKey, setBoardKey] = useState(0);

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

  async function fetchSuggestion() {
    setSuggestBusy(true); setError("");
    try {
      const res = await fetch("/api/student/degree-plan/suggest");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setSuggestBusy(false); return; }
      setSuggestion(json); setSuggestBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSuggestBusy(false); }
  }

  async function applySuggestion() {
    setSuggestBusy(true); setError("");
    try {
      const res = await fetch("/api/student/degree-plan/suggest/apply", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setSuggestBusy(false); return; }
      setSuggestion(null);
      await load(); setBoardKey((k) => k + 1); setSuggestBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSuggestBusy(false); }
  }

  const cgpa = useMemo(() => {
    if (!data) return null;
    // Best attempt per course counts (a retaken F does not drag the average).
    const bestByCode = new Map<string, { gpaPoints: number; creditHours: number }>();
    for (const t of data.transcriptRecords) {
      if (t.gpaPoints === null) continue;
      const key = t.courseCode.trim().toUpperCase();
      const cur = bestByCode.get(key);
      if (!cur || t.gpaPoints > cur.gpaPoints) bestByCode.set(key, { gpaPoints: t.gpaPoints, creditHours: t.creditHours });
    }
    let totalPoints = 0, totalCredits = 0;
    bestByCode.forEach((b) => { totalPoints += b.gpaPoints * b.creditHours; totalCredits += b.creditHours; });
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
  // What to register for, and when — every course that's due now or
  // already overdue and isn't already enrolled, ranked so the courses
  // with zero slack (or that are already behind) surface first.
  const registerNow = data.planned
    .filter((p) => !p.currentlyEnrolled && p.plannedSemesterNumber <= data.currentSemesterNumber)
    .sort((a, b) => (Number(b.isCriticalChain) - Number(a.isCriticalChain)) || (a.plannedSemesterNumber - b.plannedSemesterNumber) || (b.chainDepth - a.chainDepth));
  const transcriptByTerm = new Map<string, Transcript[]>();
  for (const t of data.transcriptRecords) {
    const key = `${t.termName} ${t.termYear}`;
    transcriptByTerm.set(key, [...(transcriptByTerm.get(key) || []), t]);
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {warning && <div style={{ background: "#FBEED2", color: "#96650F", padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{warning}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14 }}>Suggest My Schedule</h3>
            <p style={{ fontSize: 11.5, color: "var(--slate)" }}>
              Auto-suggests which semester to take each remaining course, balancing credit load and prerequisite
              order. Review it below before anything is changed — you (or your advisor) can still move any
              course afterward.
            </p>
          </div>
          <button onClick={fetchSuggestion} disabled={suggestBusy} className="btn btn-brass" style={{ fontSize: 12, padding: "6px 14px", whiteSpace: "nowrap" }}>
            {suggestBusy ? "Working…" : "Suggest My Schedule"}
          </button>
        </div>

        {suggestion && (
          <div style={{ marginTop: 14, padding: 12, background: "#FAFAF8", border: "1px solid var(--line)" }}>
            <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>
              Preview — nothing is saved yet. <b>Confirmed</b> means another batch has actually run that course
              in that semester before; <b>Estimated</b> is a Fall/Spring guess based on the course's usual
              semester, since no confirmed offering was found.
            </p>
            {suggestion.bySemester.map((s) => {
              const overLimit = s.totalCredits > suggestion.maxCreditsPerSemester;
              return (
                <div key={s.semesterNumber} style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Semester {s.semesterNumber} ({s.termLabel})
                    <span style={{ fontWeight: 400, color: overLimit ? "var(--rust)" : "var(--slate)", marginLeft: 8 }}>
                      {s.totalCredits} cr{overLimit ? ` — over your ${suggestion.maxCreditsPerSemester}-credit limit` : ""}
                    </span>
                  </p>
                  {s.courses.map((c) => (
                    <div key={c.courseId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
                      <span>
                        {c.code} — {c.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({c.creditHours} cr)</span>
                        {c.isRetake && <span className="badge badge-warn" style={{ marginLeft: 6, fontSize: 9.5 }}>Retake</span>}
                      </span>
                      <span className={`badge ${c.offeringConfirmed ? "badge-ok" : "badge-neutral"}`} style={{ fontSize: 9.5 }}>
                        {c.offeringConfirmed ? "Confirmed" : "Estimated"}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={applySuggestion} disabled={suggestBusy} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 14px" }}>Apply This Plan</button>
              <button onClick={() => setSuggestion(null)} disabled={suggestBusy} className="btn" style={{ fontSize: 12, padding: "5px 14px" }}>Discard</button>
            </div>
          </div>
        )}
      </div>

      {data.planned.some((p) => p.isCriticalChain) && (
        <div className="card" style={{ borderColor: "var(--rust)", background: "#FBEAEA" }}>
          <h3 style={{ fontSize: 13, color: "var(--rust)" }}>⚠ Critical Chain Courses</h3>
          <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 4 }}>
            Courses marked ⚠ below have no room left to slip — failing one (and retaking it the next time it's
            offered) would push every course that requires it back a semester too, delaying your graduation.
            Every other course still has some slack: failing it wouldn't, by itself, push your graduation date.
          </p>
        </div>
      )}

      {registerNow.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Recommended: Register For These Now</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>
            Courses due this semester or already overdue that you're not yet enrolled in, ranked by urgency.
          </p>
          {registerNow.map((c) => (
            <div key={c.courseId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{c.code} — {c.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({c.creditHours} cr)</span></span>
              {c.plannedSemesterNumber < data.currentSemesterNumber ? (
                <span className="badge" style={{ fontSize: 10, background: "#FBEAEA", color: "var(--rust)" }}>Overdue — register as soon as it's offered</span>
              ) : c.isCriticalChain ? (
                <span className="badge" style={{ fontSize: 10, background: "#FBEAEA", color: "var(--rust)" }}>⚠ Critical — register this semester</span>
              ) : (
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>Register this semester</span>
              )}
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>My full degree plan</h3>
      <DegreeSchemeBoard key={boardKey} onChange={load} />
    </div>
  );
}
