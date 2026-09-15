"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Course = { code: string; title: string; courseType: string; priority: number | null };

const PRIORITY_COLORS: Record<number, string> = {
  1: "#2E7D32", // top priority - dark green
  2: "#8BC34A", // good - light green
  3: "#FFF176", // fifty-fifty - yellow
};
const PRIORITY_LABELS: Record<number, string> = { 1: "1 — Top priority", 2: "2 — Good, yes", 3: "3 — Fifty-fifty" };

export default function CoursePreferencesManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/faculty/course-preferences");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function setPriority(code: string, priority: number | null) {
    setSavingCode(code); setError("");
    try {
      const res = await fetch("/api/faculty/course-preferences", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseCode: code, priority }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSavingCode(null); return; }
      setCourses((prev) => prev.map((c) => (c.code === code ? { ...c, priority } : c)));
      setSavingCode(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingCode(null); }
  }

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>My Course Preferences</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Rank how interested you are in teaching each course — this is visible to the Course Assigner as a hint
        when they're deciding assignments. Leave unset if you're not interested.
      </p>
      {error && <div className="err">{error}</div>}
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
      ) : (
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Preference</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No courses on record yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.code} style={{ background: c.priority ? PRIORITY_COLORS[c.priority] + "33" : undefined }}>
                <td><b>{c.code}</b></td><td>{c.title}</td><td>{c.courseType}</td>
                <td>
                  <select
                    value={c.priority ?? ""} disabled={savingCode === c.code}
                    onChange={(e) => setPriority(c.code, e.target.value ? parseInt(e.target.value, 10) : null)}
                    style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, background: c.priority ? PRIORITY_COLORS[c.priority] : undefined }}
                  >
                    <option value="">Not interested</option>
                    <option value="1">1 — Top priority</option>
                    <option value="2">2 — Good, yes</option>
                    <option value="3">3 — Fifty-fifty</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      )}
    </div>
  );
}
