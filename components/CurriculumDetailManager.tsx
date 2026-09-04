"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type MCourse = { id: string; code: string; title: string; creditHours: number; category: string; semesterNumber: number | null };
type MPlo = { id: string; number: number; title: string; description: string };

const CATEGORIES = ["General Education", "Major", "IDS", "Certification", "Capstone Project", "Field Experience"];

export default function CurriculumDetailManager({ curriculumId, courses, plos }: { curriculumId: string; courses: MCourse[]; plos: MPlo[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingPloId, setEditingPloId] = useState<string | null>(null);

  async function addCourse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/courses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"),
          category: fd.get("category"), semesterNumber: fd.get("semesterNumber") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveCourseEdit(e: React.FormEvent<HTMLFormElement>, courseId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/courses/${courseId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"),
          category: fd.get("category"), semesterNumber: fd.get("semesterNumber") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingCourseId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeCourse(courseId: string) {
    setLoading(true);
    await fetch(`/api/admin/curricula/${curriculumId}/courses/${courseId}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  async function addPlo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/plos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: fd.get("number"), title: fd.get("title"), description: fd.get("description") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function savePloEdit(e: React.FormEvent<HTMLFormElement>, ploId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/plos/${ploId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: fd.get("title"), description: fd.get("description") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingPloId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removePlo(ploId: string) {
    setLoading(true);
    await fetch(`/api/admin/curricula/${curriculumId}/plos/${ploId}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Courses ({courses.length})</h3>
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Category</th><th>Sem</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
            {courses.map((c) => editingCourseId === c.id ? (
              <tr key={c.id}>
                <td colSpan={6}>
                  <form onSubmit={(e) => saveCourseEdit(e, c.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <input name="code" defaultValue={c.code} style={{ width: 90, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="title" defaultValue={c.title} style={{ flex: "1 1 200px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="creditHours" type="number" defaultValue={c.creditHours} style={{ width: 70, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <select name="category" defaultValue={c.category} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                      {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <input name="semesterNumber" type="number" min={1} max={8} defaultValue={c.semesterNumber ?? ""} style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} placeholder="Sem" />
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingCourseId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>{c.code}</td><td>{c.title}</td><td>{c.creditHours}</td><td>{c.category}</td><td>{c.semesterNumber ?? "—"}</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingCourseId(c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                  <button onClick={() => removeCourse(c.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add Course</h3>
        <form onSubmit={addCourse}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 12 }}>
            <div className="field"><label>Code</label><input name="code" required /></div>
            <div className="field"><label>Title</label><input name="title" required /></div>
            <div className="field"><label>Credits</label><input name="creditHours" type="number" required /></div>
            <div className="field"><label>Category</label><select name="category" required>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="field"><label>Semester</label><input name="semesterNumber" type="number" min={1} max={8} /></div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add Course"}</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>PLOs ({plos.length})</h3>
        <SortableTable>
          <thead><tr><th>#</th><th>Title</th><th>Description</th><th></th></tr></thead>
          <tbody>
            {plos.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No PLOs yet.</td></tr>}
            {plos.map((p) => editingPloId === p.id ? (
              <tr key={p.id}>
                <td colSpan={4}>
                  <form onSubmit={(e) => savePloEdit(e, p.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <span style={{ fontWeight: 600 }}>PLO-{p.number}</span>
                    <input name="title" defaultValue={p.title} style={{ flex: "1 1 160px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="description" defaultValue={p.description} style={{ flex: "2 1 260px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingPloId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td>PLO-{p.number}</td><td>{p.title}</td><td>{p.description}</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingPloId(p.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                  <button onClick={() => removePlo(p.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add PLO</h3>
        <form onSubmit={addPlo}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
            <div className="field"><label>Number</label><input name="number" type="number" required /></div>
            <div className="field"><label>Title</label><input name="title" required /></div>
          </div>
          <div className="field"><label>Description</label><input name="description" required /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add PLO"}</button>
        </form>
      </div>
    </>
  );
}
