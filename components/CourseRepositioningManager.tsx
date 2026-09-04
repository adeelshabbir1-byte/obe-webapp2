"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string; creditHours: number; courseType: string; semesterNumber: number | null; prerequisiteCode: string | null; prerequisiteSemester: number | null; isOffered: boolean };

export default function CourseRepositioningManager({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || "");
  const [targetSemester, setTargetSemester] = useState<number>(courses[0]?.semesterNumber || 1);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const currentSemesterCourses = selectedCourse ? courses.filter((c) => c.semesterNumber === selectedCourse.semesterNumber && c.id !== selectedCourse.id) : [];
  const targetSemesterCourses = courses.filter((c) => c.semesterNumber === targetSemester && c.id !== selectedCourseId);

  const currentTotalAfterMove = currentSemesterCourses.reduce((s, c) => s + c.creditHours, 0);
  const targetTotalAfterMove = targetSemesterCourses.reduce((s, c) => s + c.creditHours, 0) + (selectedCourse?.creditHours || 0);

  async function confirmMove() {
    if (!selectedCourse) return;
    if (!confirm(`Move ${selectedCourse.code} to Semester ${targetSemester}?`)) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/omc/courses/${selectedCourse.id}/reposition`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterNumber: targetSemester }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Select a Course to Move</h3>
        <select
          value={selectedCourseId}
          onChange={(e) => { setSelectedCourseId(e.target.value); const c = courses.find((x) => x.id === e.target.value); setTargetSemester(c?.semesterNumber || 1); }}
          style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, width: "100%" }}
        >
          {courses.map((c) => <option key={c.id} value={c.id} disabled={c.isOffered}>{c.code} — {c.title} (currently Sem {c.semesterNumber ?? "—"}){c.isOffered ? " — already offered" : ""}</option>)}
        </select>
      </div>

      {selectedCourse && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Move To</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <select value={targetSemester} onChange={(e) => setTargetSemester(parseInt(e.target.value, 10))} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => <option key={s} value={s}>Semester {s}</option>)}
            </select>
            <button onClick={confirmMove} disabled={loading || targetSemester === selectedCourse.semesterNumber} className="btn btn-brass">{loading ? "Moving…" : "Confirm Move"}</button>
          </div>

          {selectedCourse.prerequisiteCode && (
            <p style={{ fontSize: 12, color: targetSemester < (selectedCourse.prerequisiteSemester || 0) ? "var(--rust)" : "var(--slate)", marginBottom: 10 }}>
              Prerequisite: {selectedCourse.prerequisiteCode} (Semester {selectedCourse.prerequisiteSemester})
              {targetSemester < (selectedCourse.prerequisiteSemester || 0) && " — this move would come before its own prerequisite and will be blocked."}
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "var(--slate)", marginBottom: 4 }}>Semester {selectedCourse.semesterNumber} after move (without this course)</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{currentTotalAfterMove} credit hrs</div>
              <div style={{ fontSize: 11, color: "var(--slate)" }}>{currentSemesterCourses.length} course(s) remaining</div>
            </div>
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "var(--slate)", marginBottom: 4 }}>Semester {targetSemester} after move (with this course)</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif", color: "var(--brass-dark)" }}>{targetTotalAfterMove} credit hrs</div>
              <div style={{ fontSize: 11, color: "var(--slate)" }}>{targetSemesterCourses.length + 1} course(s) total</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
