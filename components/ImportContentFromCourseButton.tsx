"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string; degreeProgram: string; batchName: string };

export default function ImportContentFromCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [noEquivalenceGroup, setNoEquivalenceGroup] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch(`/api/subjectexpert/import-content-courses?courseId=${courseId}`)
      .then((res) => res.json())
      .then((data) => {
        setCourses((data.courses || []).filter((c: Course) => c.id !== courseId));
        setNoEquivalenceGroup(!!data.noEquivalenceGroup);
        setLoaded(true);
      })
      .catch((err) => setError("Failed to load courses: " + err.message));
  }, [open, loaded, courseId]);

  async function handleImport() {
    if (!sourceId) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/import-content`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceCourseId: sourceId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed."); setBusy(false); return; }
      setResult(data); setConfirmed(false); setBusy(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  const optionLabel = (c: Course) => `${c.code} — ${c.title} [${c.degreeProgram}, ${c.batchName}]`;

  return (
    <div className="card" style={{ borderColor: "var(--brass)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, color: "var(--brass-dark)" }}>Import from Another Course</h3>
        <button onClick={() => setOpen(!open)} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 10px" }}>
          {open ? "Cancel" : "Pick a Source Course"}
        </button>
      </div>
      {!open && (
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 6 }}>
          Pull in CLOs, PLO mappings, the weekly lecture plan, and assessment instruments from a course OMC has
          marked as equivalent to this one — a twin section of the same real class — instead of starting from
          scratch.
        </p>
      )}
      {open && (
        <div style={{ marginTop: 10 }}>
          {error && <div className="err">{error}</div>}
          {!loaded ? (
            <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
          ) : noEquivalenceGroup ? (
            <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
              This course hasn't been marked equivalent to any other course yet — OMC sets that up on the Course
              Equivalence Matrix. Once it is, its equivalent course(s) will be available to copy from here.
            </p>
          ) : courses.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
              This course's equivalent course(s) don't have any content yet — there's nothing to copy from.
            </p>
          ) : (
            <>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Copy FROM</label>
              <select
                value={sourceId}
                onChange={(e) => { setSourceId(e.target.value); setConfirmed(false); setResult(null); }}
                style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 13, marginBottom: 10 }}
              >
                <option value="">Select a course…</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}
              </select>

              {sourceId && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, marginBottom: 10 }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                  I understand this replaces this course's existing CLOs, PLO mappings, weekly lecture plan, and
                  assessment instruments — this cannot be undone.
                </label>
              )}

              <button onClick={handleImport} disabled={!sourceId || !confirmed || busy} className="btn btn-brass">
                {busy ? "Importing…" : "Import Content"}
              </button>
            </>
          )}

          {result && (
            <div style={{ marginTop: 12, fontSize: 13, background: "#F0FBF4", border: "1px solid var(--sage)", padding: 10 }}>
              Done — copied {result.cloCount} CLO(s), {result.lectureRowCount} lecture row(s), and {result.instrumentCount} assessment instrument(s).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
