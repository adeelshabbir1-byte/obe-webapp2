"use client";

import { useState, useMemo } from "react";
import SortableTable from "./SortableTable";
import CourseEditModal from "./CourseEditModal";
import { courseTypeColor } from "../lib/courseTypeColors";

// Master Curriculum's own category labels differ slightly from the
// real Course model's courseType strings (e.g. "Domain Elective" vs
// "Elective") — map to the shared color scheme's keys so both views
// render the same type with the same color.
function masterCategoryColor(category: string): string {
  const map: Record<string, string> = {
    "Major": "Core", "Domain Elective": "Elective", "General Education / Other": "General Education",
  };
  return courseTypeColor(map[category] || category);
}

type Clo = { id: string; statement: string; bloomLevel: string; orderIndex: number; mappedPloNumber: number | null; ploMappingSource: string | null };
type MCourse = { id: string; code: string; title: string; creditHours: number; category: string; domain: string | null; semesterNumber: number | null; textbook: string | null; catalogDescription: string | null; referenceMaterial: string | null; prerequisiteCourseId: string | null; prerequisiteCourseTitle: string | null; seedClos: Clo[]; suggestedPloNumbers: number[] };
type MPlo = { id: string; number: number; title: string; description: string };

const CATEGORIES = ["General Education", "Core", "Elective", "IDS", "Certification", "Capstone Project", "Field Experience"];
const BLOOM_LEVELS = ["C1", "C2", "C3", "C4", "C5", "C6"];

// Everything below updates its own local state directly from each
// request's own response, instead of calling router.refresh() after
// every small edit — which used to re-fetch this entire curriculum's
// full course list (hundreds of courses, each with CLOs and PLO
// mappings) from the server on every single save. One section changes,
// only that section's local state updates — matching how a
// well-behaved multi-section form should feel.
export default function CurriculumDetailManager({ curriculumId, courses: initialCourses, plos: initialPlos }: { curriculumId: string; courses: MCourse[]; plos: MPlo[] }) {
  const [courses, setCourses] = useState<MCourse[]>(initialCourses);
  const [plos, setPlos] = useState<MPlo[]>(initialPlos);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingPloId, setEditingPloId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");

  function updateCourseLocal(courseId: string, patch: Partial<MCourse>) {
    setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, ...patch } : c)));
  }

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
          textbook: fd.get("textbook") || null, catalogDescription: fd.get("catalogDescription") || null, referenceMaterial: fd.get("referenceMaterial") || null,
          prerequisiteCourseId: fd.get("prerequisiteCourseId") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      const prereq = courses.find((c) => c.id === data.course.prerequisiteCourseId);
      setCourses((prev) => [...prev, { ...data.course, prerequisiteCourseTitle: prereq?.title ?? null, seedClos: [], suggestedPloNumbers: [] }]);
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeCourse(courseId: string) {
    setLoading(true);
    await fetch(`/api/admin/curricula/${curriculumId}/courses/${courseId}`, { method: "DELETE" });
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    setLoading(false);
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
      setPlos((prev) => [...prev, data.plo].sort((a, b) => a.number - b.number));
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function savePloEdit(e: React.FormEvent<HTMLFormElement>, ploId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    const title = fd.get("title") as string, description = fd.get("description") as string;
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/plos/${ploId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setPlos((prev) => prev.map((p) => p.id === ploId ? { ...p, title, description } : p));
      setEditingPloId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removePlo(ploId: string) {
    setLoading(true);
    await fetch(`/api/admin/curricula/${curriculumId}/plos/${ploId}`, { method: "DELETE" });
    setPlos((prev) => prev.filter((p) => p.id !== ploId));
    setLoading(false);
  }

  const uniqueCategories = useMemo(() => Array.from(new Set(courses.map((c) => c.category))).sort(), [courses]);
  const uniqueDomains = useMemo(() => Array.from(new Set(courses.map((c) => c.domain).filter((d): d is string => !!d))).sort(), [courses]);
  const filteredCourses = useMemo(() => courses.filter((c) =>
    (!categoryFilter || c.category === categoryFilter) && (!domainFilter || c.domain === domainFilter)
  ), [courses, categoryFilter, domainFilter]);

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Courses ({filteredCourses.length} of {courses.length})</h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12 }}>
            <option value="">All categories</option>
            {uniqueCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          {categoryFilter === "Domain Elective" && (
            <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12 }}>
              <option value="">All domains</option>
              {uniqueDomains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Category</th><th>Sem</th><th></th></tr></thead>
          <tbody>
            {filteredCourses.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses match this filter.</td></tr>}
            {filteredCourses.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>
                  {c.title}
                  {c.prerequisiteCourseTitle && <div style={{ fontSize: 10, color: "var(--slate)" }}>Prereq: {c.prerequisiteCourseTitle}</div>}
                </td>
                <td>{c.creditHours}</td>
                <td>
                  <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 3, background: masterCategoryColor(c.category), color: "#fff" }}>
                    {c.category}
                  </span>
                  {c.domain && <div style={{ fontSize: 9.5, color: "var(--slate)", marginTop: 2 }}>{c.domain}</div>}
                </td>
                <td>{c.semesterNumber ?? "—"}</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingCourseId(c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                    Edit ({c.seedClos.length} CLOs, {c.suggestedPloNumbers.length} PLOs)
                  </button>
                  <button onClick={() => removeCourse(c.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      {editingCourseId && (() => {
        const editingCourse = courses.find((c) => c.id === editingCourseId);
        if (!editingCourse) return null;
        return (
          <CourseEditModal
            course={editingCourse}
            plos={plos}
            allCourses={courses}
            curriculumId={curriculumId}
            onClose={() => setEditingCourseId(null)}
            onSaved={(courseId, patch) => updateCourseLocal(courseId, patch)}
          />
        );
      })()}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add Course</h3>
        <form onSubmit={addCourse}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 12 }}>
            <div className="field"><label>Code</label><input name="code" required /></div>
            <div className="field"><label>Title</label><input name="title" required /></div>
            <div className="field"><label>Credits</label><input name="creditHours" type="number" required /></div>
            <div className="field"><label>Category</label><select name="category" required>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="field"><label>Semester</label><input name="semesterNumber" type="number" min={1} max={8} /></div>
            <div className="field"><label>Prerequisite</label>
              <select name="prerequisiteCourseId" defaultValue="">
                <option value="">No prerequisite</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
            <div className="field"><label>Textbook (optional)</label><input name="textbook" /></div>
            <div className="field"><label>Reference Material (optional)</label><input name="referenceMaterial" /></div>
          </div>
          <div className="field"><label>Catalog Description / Course Outline (optional)</label><textarea name="catalogDescription" style={{ width: "100%", minHeight: 60, padding: "6px 8px", border: "1px solid var(--line)" }} /></div>
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
