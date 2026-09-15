"use client";

import { useState, useEffect } from "react";

type Course = { id: string; code: string; title: string; instructorId: string | null; instructorName: string | null; batchLabel: string };
type Faculty = { id: string; name: string };

export default function PrimaryInstructorAssigner() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/assigner/primary-instructors");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setFaculty(data.faculty); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

  async function assign(courseId: string, instructorId: string) {
    setBusyId(courseId); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/assign-instructor`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructorId: instructorId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Primary Instructor Assignment</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Sets each course's main instructor of record — separate from the section-count matrix below, which
        handles additional sections when a course has more than one.
      </p>
      {error && <div className="err">{error}</div>}
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
      ) : (
        <table>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Instructor</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batchLabel}</td><td>{c.code}</td><td>{c.title}</td>
                <td>
                  <select defaultValue={c.instructorId || ""} onChange={(e) => assign(c.id, e.target.value)} disabled={busyId === c.id} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                    <option value="">— Unassigned —</option>
                    {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
