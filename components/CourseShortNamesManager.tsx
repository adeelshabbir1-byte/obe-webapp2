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

  // Courses sharing a short name sit together (alphabetical by short name); courses with no short name come last.
  const key = (c: Course) => (c.shortName || "").trim().toLowerCase();
  const sorted = [...courses].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (!ka !== !kb) return ka ? -1 : 1;
    return ka.localeCompare(kb) || a.code.localeCompare(b.code);
  });
  const groupSize = new Map<string, number>();
  for (const c of courses) if (key(c)) groupSize.set(key(c), (groupSize.get(key(c)) || 0) + 1);
  const shared = sorted.filter((c) => key(c) && (groupSize.get(key(c)) || 0) > 1);
  const sharedKeys = Array.from(new Set(shared.map(key)));

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Course Short Names</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Set a short display name (up to 8 characters) for any course — used only in the Section Assignment
        Matrix to keep it compact. This is purely cosmetic: it never changes the course's real code or title
        anywhere else. Leave blank to fall back to an automatic abbreviation. Courses with a short name are listed first, grouped so the ones sharing the same short name sit together and are shaded alike; courses without one are at the bottom.
      </p>
      {error && <div className="err">{error}</div>}
      <SortableTable>
        <thead><tr><th>Code</th><th>Title</th><th>Short Name</th></tr></thead>
        <tbody>
          {courses.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
          {sorted.map((c, i) => {
            const k = key(c), n = k ? groupSize.get(k) || 0 : 0;
            const isShared = n > 1;
            const startsGroup = k && (i === 0 || key(sorted[i - 1]) !== k);
            return (
            <tr key={c.code} style={{
              background: isShared ? (sharedKeys.indexOf(k) % 2 === 0 ? "#FFF3D6" : "#E8F1FB") : undefined,
              borderTop: startsGroup && i > 0 ? "2px solid var(--line)" : undefined,
            }}>
              <td><b>{c.code}</b></td><td>{c.title}{isShared && <span style={{ marginLeft: 8, fontSize: 10.5, color: "var(--slate)" }}>· same short name as {n - 1} other course{n - 1 === 1 ? "" : "s"}</span>}</td>
              <td>
                <input
                  defaultValue={c.shortName || ""} maxLength={8} placeholder="e.g. DiscMth"
                  disabled={savingCode === c.code}
                  onBlur={(e) => { if (e.target.value !== (c.shortName || "")) save(c.code, e.target.value); }}
                  style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, width: 100 }}
                />
              </td>
            </tr>
            );
          })}
        </tbody>
      </SortableTable>
    </div>
  );
}
