"use client";

import { useState } from "react";

type Category = { id: string; name: string; courseCount: number; facultyCount: number };
type CourseGroup = { code: string; title: string; courseIds: string[] };
type Faculty = { id: string; name: string; role: string; customCategoryId: string | null };

export default function CustomCategoriesManager({ initialCategories, courseGroups: initialCourseGroups, faculty: initialFaculty }: {
  initialCategories: Category[]; courseGroups: CourseGroup[]; faculty: Faculty[];
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [courseGroups, setCourseGroups] = useState<CourseGroup[]>(initialCourseGroups);
  const [faculty, setFaculty] = useState<Faculty[]>(initialFaculty);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [assignCategoryId, setAssignCategoryId] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [selectedFacultyIds, setSelectedFacultyIds] = useState<Set<string>>(new Set());

  async function createCategory() {
    if (!newName.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/coordinator/custom-categories", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setCategories((prev) => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(""); setBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? Courses and faculty tagged with it just lose the label — nothing else is deleted.")) return;
    setBusy(true); setError("");
    try {
      await fetch(`/api/coordinator/custom-categories/${id}`, { method: "DELETE" });
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setFaculty((prev) => prev.map((f) => f.customCategoryId === id ? { ...f, customCategoryId: null } : f));
      setBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  function toggleCourse(code: string) {
    setSelectedCodes((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  }
  function toggleFaculty(id: string) {
    setSelectedFacultyIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function applyAssignment() {
    if (selectedCodes.size === 0 && selectedFacultyIds.size === 0) { setError("Select at least one course or faculty member."); return; }
    if (!assignCategoryId) { setError("Pick a category to apply first."); return; }
    setBusy(true); setError("");
    // Expand each selected course CODE into every real course row sharing
    // that code (every batch/cohort's copy of it) — one checkbox, applied
    // everywhere at once, so this never needs repeating per cohort.
    const courseIds = courseGroups.filter((g) => selectedCodes.has(g.code)).flatMap((g) => g.courseIds);
    try {
      const res = await fetch("/api/coordinator/custom-categories/bulk-assign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: assignCategoryId, courseIds, facultyIds: Array.from(selectedFacultyIds) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      // Categorized course groups drop out of the picker entirely — this
      // is exactly what shrinks the Coordinator's remaining workload.
      setCourseGroups((prev) => prev.filter((g) => !selectedCodes.has(g.code)));
      setFaculty((prev) => prev.map((f) => selectedFacultyIds.has(f.id) ? { ...f, customCategoryId: assignCategoryId } : f));
      setCategories((prev) => prev.map((cat) => cat.id === assignCategoryId ? { ...cat, courseCount: cat.courseCount + courseIds.length, facultyCount: cat.facultyCount + selectedFacultyIds.size } : cat));
      setSelectedCodes(new Set()); setSelectedFacultyIds(new Set()); setBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  function categoryName(id: string | null) {
    return categories.find((c) => c.id === id)?.name || "Uncategorized";
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Your Categories</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Your own classification — completely separate from HEC's official Core/Elective/Lab/IDS course
          type. Use whatever groupings make sense to you (e.g. Fundamentals, Management, Maths, Engineering,
          Specialization Elective), and tag both courses and faculty with them below to help match one
          against the other when assigning instructors.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }} />
          <button onClick={createCategory} disabled={busy} className="btn btn-brass" style={{ fontSize: 12.5 }}>Add Category</button>
        </div>
        {categories.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No categories yet — add one above.</p>}
        {categories.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13 }}>{c.name} <span style={{ color: "var(--slate)", fontSize: 11.5 }}>({c.courseCount} course{c.courseCount === 1 ? "" : "s"}, {c.facultyCount} faculty)</span></span>
            <button onClick={() => deleteCategory(c.id)} disabled={busy} style={{ background: "none", border: "none", color: "var(--rust)", cursor: "pointer", fontSize: 11.5 }}>Delete</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Assign a Category</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Only still-uncategorized courses are listed — one row per course code, regardless of how many
          batches/cohorts offer it, and content-sync follower sections are hidden entirely (they inherit
          their base's category automatically). Categorizing one row here applies it everywhere that code
          appears.
        </p>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Category to apply</label>
          <select value={assignCategoryId} onChange={(e) => setAssignCategoryId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
            <option value="">— Choose —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Uncategorized Courses ({selectedCodes.size} selected of {courseGroups.length})</p>
            <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--line)", padding: 8 }}>
              {courseGroups.length === 0 && <p style={{ fontSize: 11.5, color: "var(--slate)" }}>Every course already has a category.</p>}
              {courseGroups.map((g) => (
                <label key={g.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                  <input type="checkbox" checked={selectedCodes.has(g.code)} onChange={() => toggleCourse(g.code)} />
                  {g.code} — {g.title}
                  {g.courseIds.length > 1 && <span style={{ color: "var(--slate)", fontSize: 10.5 }}>({g.courseIds.length} sections)</span>}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Faculty ({selectedFacultyIds.size} selected)</p>
            <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--line)", padding: 8 }}>
              {faculty.map((f) => (
                <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                  <input type="checkbox" checked={selectedFacultyIds.has(f.id)} onChange={() => toggleFaculty(f.id)} />
                  {f.name} <span style={{ color: "var(--slate)", fontSize: 10.5 }}>({categoryName(f.customCategoryId)})</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <button onClick={applyAssignment} disabled={busy} className="btn btn-brass" style={{ marginTop: 14, fontSize: 12.5 }}>
          {busy ? "Applying…" : "Apply to Selected"}
        </button>
      </div>
    </>
  );
}
