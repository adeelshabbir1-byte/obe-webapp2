"use client";

import { useState } from "react";

type Course = { id: string; code: string; title: string; creditHours: number; semesterNumber: number | null };

// Every field here is a plain, always-editable input — no click-to-edit
// step at all, since editing code/title/semester for most or all
// courses in a batch in one sitting is the common case here, not the
// exception. Saves per-row on blur (tabbing or clicking to the next
// field), sending that row's full current values together since the
// underlying endpoint validates code/title/creditHours as a set.
export default function BatchCoursesQuickEditTable({ initialCourses }: { initialCourses: Course[] }) {
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function updateLocal(id: string, patch: Partial<Course>) {
    setCourses((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }

  async function saveRow(course: Course) {
    setSavingId(course.id); setError(""); setSavedId(null);
    try {
      const res = await fetch(`/api/coordinator/courses/${course.id}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: course.code, title: course.title, creditHours: course.creditHours, semesterNumber: course.semesterNumber }),
      });
      const data = await res.json();
      if (!res.ok) { setError(`${course.code || "(row)"}: ${data.error || "Something went wrong."}`); setSavingId(null); return; }
      setSavingId(null); setSavedId(course.id);
      setTimeout(() => setSavedId((cur) => cur === course.id ? null : cur), 1500);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingId(null); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 13, marginBottom: 4 }}>Quick Edit</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Every field below is already editable — no need to click into an edit mode first. Saves automatically
        when you tab or click away from a field.
      </p>
      {error && <div className="err">{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>Code</th>
              <th style={{ padding: "4px 6px" }}>Title</th>
              <th style={{ padding: "4px 6px" }}>Credits</th>
              <th style={{ padding: "4px 6px" }}>Sem</th>
              <th style={{ padding: "4px 6px" }}></th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "3px 6px" }}>
                  <input value={c.code} onChange={(e) => updateLocal(c.id, { code: e.target.value })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: 90, padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input value={c.title} onChange={(e) => updateLocal(c.id, { title: e.target.value })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: "100%", minWidth: 220, padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input type="number" value={c.creditHours} onChange={(e) => updateLocal(c.id, { creditHours: Number(e.target.value) })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: 55, padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input type="number" min={1} max={8} value={c.semesterNumber ?? ""} onChange={(e) => updateLocal(c.id, { semesterNumber: e.target.value ? Number(e.target.value) : null })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: 50, padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px", fontSize: 10.5, color: "var(--sage)", minWidth: 50 }}>
                  {savingId === c.id ? "Saving…" : savedId === c.id ? "Saved ✓" : ""}
                </td>
              </tr>
            ))}
            {courses.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)", padding: "6px" }}>No courses in this batch yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
