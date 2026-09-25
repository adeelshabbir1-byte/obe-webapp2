"use client";

import { useState, useEffect } from "react";

type Course = { code: string; title: string; priority: number | null };

const PRIORITY_COLORS: Record<string, string> = {
  "1": "#BDEBD6", // green — top priority
  "2": "#FFF9C4", // yellow — good
  "3": "#FFE0B2", // orange — neutral/50-50
  "null": "#F0F0F0", // gray — not interested / unset
};

export default function MyCoursePrioritiesManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/faculty/my-course-priorities");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function setPriority(code: string, priority: number | null) {
    setSavingCode(code); setError("");
    try {
      const res = await fetch("/api/faculty/my-course-priorities", {
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
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>My Course Priorities</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Tell Course Assigner which courses you'd like to teach. 1 = top priority, 2 = good, 3 = neutral/50-50.
        Leave unset for "not interested" — this is visible as a color-coded hint when assigning, not a guarantee.
      </p>
      {error && <div className="err">{error}</div>}
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
      ) : (
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Priority</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No offered courses to rate yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.code} style={{ background: PRIORITY_COLORS[String(c.priority)] }}>
                <td style={{ fontWeight: 600 }}>{c.code}</td><td>{c.title}</td>
                <td>
                  <select
                    value={c.priority ?? ""} disabled={savingCode === c.code}
                    onChange={(e) => setPriority(c.code, e.target.value === "" ? null : parseInt(e.target.value, 10))}
                    style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}
                  >
                    <option value="">Not interested</option>
                    <option value="1">1 — Top priority</option>
                    <option value="2">2 — Good</option>
                    <option value="3">3 — Neutral / 50-50</option>
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
