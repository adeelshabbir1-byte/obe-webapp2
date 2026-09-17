"use client";

import { useState, useEffect } from "react";

type Course = { id: string; code: string; title: string; degreeProgram: string; batchName: string; hasGradedMarks: boolean };

export default function ImportCourseContentManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetch("/api/omc/import-content-courses")
      .then((res) => res.json())
      .then((data) => { setCourses(data.courses || []); setLoaded(true); })
      .catch((err) => setError("Failed to load courses: " + err.message));
  }, []);

  const target = courses.find((c) => c.id === targetId);

  async function handleImport() {
    if (!sourceId || !targetId) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/omc/courses/import-content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCourseId: sourceId, targetCourseId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed."); setBusy(false); return; }
      setResult(data); setConfirmed(false); setBusy(false);
    } catch (err: any) {
      setError("Unexpected error: " + err.message); setBusy(false);
    }
  }

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;

  const optionLabel = (c: Course) => `${c.code} — ${c.title} [${c.degreeProgram}, ${c.batchName}]`;

  return (
    <div className="card">
      {error && <div className="err">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Copy FROM (source)</label>
          <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setConfirmed(false); setResult(null); }} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 13 }}>
            <option value="">Select a course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Copy INTO (target — its own content will be replaced)</label>
          <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setConfirmed(false); setResult(null); }} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 13 }}>
            <option value="">Select a course…</option>
            {courses.filter((c) => c.id !== sourceId).map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}{c.hasGradedMarks ? " ⚠ has graded marks" : ""}</option>)}
          </select>
        </div>
      </div>

      {target?.hasGradedMarks && (
        <div className="err" style={{ marginBottom: 16 }}>
          This target course already has entered student marks. Importing would delete that graded work, so it's blocked —
          pick a different target, or clear its grades first if you're certain.
        </div>
      )}

      {sourceId && targetId && !target?.hasGradedMarks && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 16 }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
          I understand this replaces the target course's existing CLOs, PLO mappings, weekly lecture plan, and
          assessment instruments — this cannot be undone.
        </label>
      )}

      <button onClick={handleImport} disabled={!sourceId || !targetId || !confirmed || busy || target?.hasGradedMarks} className="btn btn-brass">
        {busy ? "Importing…" : "Import Content"}
      </button>

      {result && (
        <div style={{ marginTop: 16, fontSize: 13, background: "#F0FBF4", border: "1px solid var(--sage)", padding: 10 }}>
          Done — copied {result.cloCount} CLO(s), {result.lectureRowCount} lecture row(s), and {result.instrumentCount} assessment instrument(s).
        </div>
      )}
    </div>
  );
}
