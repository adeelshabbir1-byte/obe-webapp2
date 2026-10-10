"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string; creditHours: number; semesterNumber: number | null; courseType: string };
type MasterCourse = { id: string; code: string; title: string; category: string; domain: string | null };

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience", "Certification"];

// Course Repositioning's own "edit the batch's course list" panel — a
// trimmed-down version of what the Coordinator's Courses page already
// does (quick-edit table + import-from-curriculum + add/delete), so OMC
// (or a Coordinator viewing here instead) doesn't have to leave this
// page to add, remove, or retitle/re-credit a course before sequencing
// it. Every save/add/delete goes through the same API routes the
// Courses page uses — those routes accept both roles for exactly this.
export default function BatchCoursesAdminPanel({ batchId, initialCourses, curriculumId }: {
  batchId: string; initialCourses: Course[]; curriculumId: string | null;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [curriculumCourses, setCurriculumCourses] = useState<MasterCourse[]>([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setCourses(initialCourses); }, [initialCourses]);

  function updateLocal(id: string, patch: Partial<Course>) {
    setCourses((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }

  async function saveRow(course: Course) {
    setSavingId(course.id); setError(""); setSavedId(null);
    try {
      const res = await fetch(`/api/coordinator/courses/${course.id}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: course.code, title: course.title, creditHours: course.creditHours, semesterNumber: course.semesterNumber, courseType: course.courseType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(`${course.code || "(row)"}: ${data.error || "Something went wrong."}`); setSavingId(null); return; }
      setSavingId(null); setSavedId(course.id);
      setTimeout(() => setSavedId((cur) => cur === course.id ? null : cur), 1500);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingId(null); }
  }

  async function deleteCourse(course: Course) {
    const proceed = confirm(`Delete ${course.code} — ${course.title}? This also permanently deletes its CLOs, lecture plan, assessments, marks, and enrollments. This cannot be undone.`);
    if (!proceed) return;
    setDeletingId(course.id); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${course.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setDeletingId(null); return; }
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      setDeletingId(null);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setDeletingId(null); }
  }

  function openImportPicker() {
    setShowImport(true); setImportResult("");
    if (!curriculumId || curriculumCourses.length > 0) return;
    setLoadingCurriculum(true);
    fetch(`/api/coordinator/curricula/${curriculumId}/courses`).then((r) => r.json()).then((data) => {
      const list: MasterCourse[] = data.courses || [];
      setCurriculumCourses(list);
      setLoadingCurriculum(false);
    }).catch(() => setLoadingCurriculum(false));
  }

  function toggleImportCourse(id: string) {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runImport() {
    if (!curriculumId || selectedImportIds.size === 0) { setError("Pick at least one course to import."); return; }
    setImporting(true); setError(""); setImportResult("");
    try {
      const res = await fetch("/api/coordinator/courses/import-hec", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, curriculumId, courseIds: Array.from(selectedImportIds) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setImporting(false); return; }
      setImportResult(`Imported ${data.created} new course(s).${data.alreadyPresent ? ` (${data.alreadyPresent} were already in this batch.)` : ""}`);
      setSelectedImportIds(new Set());
      setImporting(false);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setImporting(false); }
  }

  async function addManually(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"), courseType: fd.get("courseType"), batchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setAdding(false); return; }
      (e.target as HTMLFormElement).reset();
      setAdding(false);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setAdding(false); }
  }

  const importGroups = curriculumCourses.reduce<Record<string, MasterCourse[]>>((acc, c) => {
    const key = c.domain || c.category || "Other";
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="card">
      <h3 style={{ fontSize: 13, marginBottom: 4 }}>Batch Courses — Quick Edit</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Every field is already editable — saves automatically when you tab or click away. Use "Add Course" or
        "Import from Master Curriculum" below to bring in a new course, or "Delete" to remove one entirely.
      </p>
      {error && <div className="err">{error}</div>}
      <div style={{ overflowX: "auto" }}>
        {/*
          table-layout: fixed + explicit <col> widths, so Code/Credits/Sem/Type
          stay compact (sized to what they actually hold) and only Title takes
          the stretchy remaining space — without this, auto layout let the Type
          dropdown's widest option ("General Education") blow out its column
          and push Credits/Sem out of view even though the Code/Credits inputs
          themselves were narrow.
        */}
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 70 }} />
            <col />
            <col style={{ width: 54 }} />
            <col style={{ width: 46 }} />
            <col style={{ width: 118 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>Code</th>
              <th style={{ padding: "4px 6px" }}>Title</th>
              <th style={{ padding: "4px 6px" }}>Credits</th>
              <th style={{ padding: "4px 6px" }}>Sem</th>
              <th style={{ padding: "4px 6px" }}>Type</th>
              <th style={{ padding: "4px 6px" }}></th>
              <th style={{ padding: "4px 6px" }}></th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "3px 6px" }}>
                  <input value={c.code} onChange={(e) => updateLocal(c.id, { code: e.target.value })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: "100%", boxSizing: "border-box", padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input value={c.title} onChange={(e) => updateLocal(c.id, { title: e.target.value })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: "100%", boxSizing: "border-box", padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input type="number" value={c.creditHours} onChange={(e) => updateLocal(c.id, { creditHours: Number(e.target.value) })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: "100%", boxSizing: "border-box", padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input type="number" min={1} max={8} value={c.semesterNumber ?? ""} onChange={(e) => updateLocal(c.id, { semesterNumber: e.target.value ? Number(e.target.value) : null })} onBlur={() => saveRow(courses.find((x) => x.id === c.id)!)} style={{ width: "100%", boxSizing: "border-box", padding: "4px 6px", border: "1px solid var(--line)" }} />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <select value={c.courseType} onChange={(e) => { updateLocal(c.id, { courseType: e.target.value }); saveRow({ ...c, courseType: e.target.value }); }} style={{ width: "100%", boxSizing: "border-box", padding: "4px 4px", border: "1px solid var(--line)", fontSize: 11 }}>
                    {COURSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td style={{ padding: "3px 6px", fontSize: 10, color: "var(--sage)" }}>
                  {savingId === c.id ? "Saving…" : savedId === c.id ? "Saved" : ""}
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <button type="button" onClick={() => deleteCourse(c)} disabled={deletingId === c.id} className="act act-danger">
                    {deletingId === c.id ? "…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {courses.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)", padding: "6px" }}>No courses in this batch yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Cancel" : "Add Course Manually"}</button>
        {curriculumId && <button type="button" className="btn" onClick={() => showImport ? setShowImport(false) : openImportPicker()}>{showImport ? "Cancel" : "Import from Master Curriculum"}</button>}
      </div>

      {showAdd && (
        <form onSubmit={addManually} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Code</label>
            <input name="code" required style={{ width: 90, padding: "4px 6px", border: "1px solid var(--line)" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Title</label>
            <input name="title" required style={{ width: 240, padding: "4px 6px", border: "1px solid var(--line)" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Credit Hours</label>
            <input name="creditHours" type="number" required style={{ width: 70, padding: "4px 6px", border: "1px solid var(--line)" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Course Type</label>
            <select name="courseType" defaultValue="Core" style={{ padding: "4px 6px", border: "1px solid var(--line)" }}>
              {COURSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}

      {showImport && (
        <div style={{ marginTop: 10, border: "1px solid var(--line)", padding: 10 }}>
          {loadingCurriculum && <p style={{ fontSize: 12, color: "var(--slate)" }}>Loading your institution's curriculum…</p>}
          {!loadingCurriculum && curriculumCourses.length === 0 && <p style={{ fontSize: 12, color: "var(--slate)" }}>No published curriculum found for this institution.</p>}
          {!loadingCurriculum && curriculumCourses.length > 0 && (
            <>
              <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>Pick which courses to bring into this batch — already-imported ones are left out automatically.</p>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {Object.entries(importGroups).map(([group, list]) => (
                  <div key={group} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 2 }}>{group}</div>
                    {list.map((mc) => (
                      <label key={mc.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "2px 0" }}>
                        <input type="checkbox" checked={selectedImportIds.has(mc.id)} onChange={() => toggleImportCourse(mc.id)} />
                        {mc.code} — {mc.title}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-brass" onClick={runImport} disabled={importing} style={{ marginTop: 8 }}>
                {importing ? "Importing…" : `Import ${selectedImportIds.size || ""} Course(s)`}
              </button>
              {importResult && <p style={{ fontSize: 11.5, color: "var(--sage)", marginTop: 6 }}>{importResult}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
