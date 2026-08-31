"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = {
  id: string; code: string; title: string; creditHours: number; courseType: string; semesterNumber: number | null;
  fromHec: boolean; subjectExpertId: string | null;
};
type SubjectExpert = { id: string; name: string };

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience"];

export default function CoursesManager({ courses, subjectExperts }: { courses: Course[]; subjectExperts: SubjectExpert[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState("");

  async function importHec() {
    setLoading(true); setError(""); setImportResult("");
    try {
      const res = await fetch("/api/coordinator/courses/import-hec", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setImportResult(`Imported ${data.created} new course(s).${data.alreadyPresent ? ` (${data.alreadyPresent} were already imported.)` : ""}`);
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addCourse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>, courseId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"),
          courseType: fd.get("courseType"), semesterNumber: fd.get("semesterNumber") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function assignSe(courseId: string, subjectExpertId: string) {
    setLoading(true);
    await fetch(`/api/coordinator/courses/${courseId}/assign-se`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectExpertId: subjectExpertId || null }),
    });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {importResult && <div style={{ background: "#E4EEE8", color: "var(--sage)", border: "1px solid #BEDACB", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{importResult}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 14 }}>Import Full HEC Curriculum</h3>
            <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 3 }}>One click adds every course from the official HEC BS Computer Science 2025 scheme. Already-imported courses are skipped.</p>
          </div>
          <button onClick={importHec} disabled={loading} className="btn btn-brass">{loading ? "Importing…" : "Import All HEC Courses"}</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Type</th><th>Semester</th><th>Source</th><th>Subject Expert</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
            {courses.map((c) => editingId === c.id ? (
              <tr key={c.id}>
                <td colSpan={8}>
                  <form onSubmit={(e) => saveEdit(e, c.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <input name="code" defaultValue={c.code} placeholder="Code" style={{ width: 90, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="title" defaultValue={c.title} placeholder="Title" style={{ flex: "1 1 200px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="creditHours" type="number" defaultValue={c.creditHours} placeholder="Credits" style={{ width: 70, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <select name="courseType" defaultValue={c.courseType} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                      {COURSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input name="semesterNumber" type="number" min={1} max={8} defaultValue={c.semesterNumber ?? ""} placeholder="Sem" style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} />
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>{c.code}</td><td>{c.title}</td><td>{c.creditHours}</td><td>{c.courseType}</td>
                <td>{c.semesterNumber ?? "—"}</td>
                <td>{c.fromHec ? <span style={{ color: "var(--sage)" }}>HEC</span> : "Manual"}</td>
                <td>
                  <select defaultValue={c.subjectExpertId || ""} onChange={(e) => assignSe(c.id, e.target.value)} disabled={loading} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                    <option value="">— Unassigned —</option>
                    {subjectExperts.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)}
                  </select>
                </td>
                <td><button onClick={() => setEditingId(c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {subjectExperts.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 10 }}>No Subject Experts onboarded yet — add one under Faculty Onboarding first.</div>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add a Course Manually</h3>
        <form onSubmit={addCourse}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 14 }}>
            <div className="field"><label>Course Code</label><input name="code" placeholder="MT 1103" required /></div>
            <div className="field"><label>Course Title</label><input name="title" placeholder="Discrete Structures" required /></div>
            <div className="field"><label>Credit Hours</label><input name="creditHours" type="number" placeholder="3" required /></div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Course"}</button>
        </form>
      </div>
    </>
  );
}
