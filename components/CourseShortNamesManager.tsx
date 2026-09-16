"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Course = { code: string; title: string; shortName: string | null };

export default function CourseShortNamesManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/assigner/course-short-names");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(code: string, shortName: string) {
    setSavingCode(code); setError("");
    try {
      const res = await fetch("/api/assigner/course-short-names", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseCode: code, shortName: shortName || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSavingCode(null); return; }
      setCourses((prev) => prev.map((c) => (c.code === code ? { ...c, shortName: shortName || null } : c)));
      setSavingCode(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingCode(null); }
  }

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Course Short Names</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Set a short display name (up to 8 characters) for any course — used only in the Section Assignment
        Matrix to keep it compact. This is purely cosmetic: it never changes the course's real code or title
        anywhere else. Leave blank to fall back to an automatic abbreviation.
      </p>
      {error && <div className="err">{error}</div>}
      <SortableTable>
        <thead><tr><th>Code</th><th>Title</th><th>Short Name</th></tr></thead>
        <tbody>
          {courses.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
          {courses.map((c) => (
            <tr key={c.code}>
              <td><b>{c.code}</b></td><td>{c.title}</td>
              <td>
                <input
                  defaultValue={c.shortName || ""} maxLength={8} placeholder="e.g. DiscMth"
                  disabled={savingCode === c.code}
                  onBlur={(e) => { if (e.target.value !== (c.shortName || "")) save(c.code, e.target.value); }}
                  style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, width: 100 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </SortableTable>
    </div>
  );
}
