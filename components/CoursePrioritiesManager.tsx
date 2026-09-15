"use client";

import { useState, useEffect } from "react";

type Course = { code: string; title: string; priority: number | null };

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "1 — Top priority", color: "#16A34A" },
  2: { label: "2 — Good", color: "#65A30D" },
  3: { label: "3 — 50/50", color: "#EAB308" },
  4: { label: "4 — Not interested", color: "#9CA3AF" },
};

export default function CoursePrioritiesManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/faculty/course-priorities");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function setPriority(code: string, priority: number) {
    setSavingCode(code); setError("");
    try {
      const res = await fetch("/api/faculty/course-priorities", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseCode: code, priority }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSavingCode(null); return; }
      setCourses((prev) => prev.map((c) => (c.code === code ? { ...c, priority } : c)));
      setSavingCode(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingCode(null); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>My Course Priorities</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Tell Course Assigner which courses you'd most like to teach this semester. This is visible as a
        color-coded hint on their assignment matrix — it's a suggestion, not a guaranteed assignment.
      </p>
      {error && <div className="err">{error}</div>}
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
      ) : (
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Priority</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.code}>
                <td>{c.code}</td><td>{c.title}</td>
                <td>
                  <select
                    value={c.priority ?? ""} onChange={(e) => setPriority(c.code, parseInt(e.target.value, 10))}
                    disabled={savingCode === c.code}
                    style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, color: c.priority ? PRIORITY_LABELS[c.priority].color : undefined, fontWeight: c.priority ? 600 : undefined }}
                  >
                    <option value="">— Not set —</option>
                    {[1, 2, 3, 4].map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p].label}</option>)}
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
