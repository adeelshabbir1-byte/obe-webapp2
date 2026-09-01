"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = {
  id: string; code: string; title: string; creditHours: number; courseType: string; semesterNumber: number | null;
  fromHec: boolean; subjectExpertId: string | null; batchName: string | null; fromBenchmark: boolean;
};
type SubjectExpert = { id: string; name: string };
type Batch = { id: string; degreeProgram: string; batchName: string };
type Curriculum = { id: string; authority: string; title: string; version: string };

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience"];

export default function CoursesManager({ courses, subjectExperts, batches, curricula, selectedBatchId }: {
  courses: Course[]; subjectExperts: SubjectExpert[]; batches: Batch[]; curricula: Curriculum[]; selectedBatchId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState("");
  const [importBatchId, setImportBatchId] = useState(selectedBatchId || batches[0]?.id || "");
  const [importCurriculumId, setImportCurriculumId] = useState(curricula[0]?.id || "");
  const [addBatchId, setAddBatchId] = useState(selectedBatchId || batches[0]?.id || "");

  function switchBatch(batchId: string) {
    const url = batchId ? `/coordinator/courses?batchId=${batchId}` : "/coordinator/courses";
    router.push(url);
  }

  async function importHec() {
    if (!importBatchId || !importCurriculumId) { setError("Select both a batch and a curriculum first."); return; }
    setLoading(true); setError(""); setImportResult("");
    try {
      const res = await fetch("/api/coordinator/courses/import-hec", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: importBatchId, curriculumId: importCurriculumId }),
      });
      let data: any = {};
      try { data = await res.json(); }
      catch {
        setError(res.ok
          ? "The import may have partly succeeded but the server didn't send a proper response — refresh the page to check what was actually imported."
          : `Server error (status ${res.status}) with no details — check Vercel's Runtime Logs, or try importing again.`);
        setLoading(false); router.refresh(); return;
      }
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      const errorNote = data.errors ? ` ${data.errors.length} course(s) failed: ${data.errors.slice(0, 3).join("; ")}${data.errors.length > 3 ? "…" : ""}` : "";
      setImportResult(`Imported ${data.created} new course(s) into this batch.${data.alreadyPresent ? ` (${data.alreadyPresent} were already imported into it.)` : ""}${data.benchmarksCopied ? ` ${data.benchmarksCopied} started pre-filled from a previous batch's template.` : ""}${errorNote}`);
      setLoading(false); router.push(`/coordinator/courses?batchId=${importBatchId}`); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addCourse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addBatchId) { setError("Select a batch first."); return; }
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"), batchId: addBatchId }),
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

  if (batches.length === 0) {
    return (
      <div className="card" style={{ borderColor: "var(--rust)" }}>
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
          Create a Degree Program & Batch first (see the "Degree Programs & Batches" page) before adding courses —
          every course belongs to a specific batch/cohort.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {importResult && <div style={{ background: "#E4EEE8", color: "var(--sage)", border: "1px solid #BEDACB", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{importResult}</div>}

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Viewing batch</label>
        <select value={selectedBatchId} onChange={(e) => switchBatch(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
          <option value="">All batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
        </select>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Import from a Master Curriculum</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>
          Choose which curriculum and which batch — the same curriculum can be imported again for a different batch,
          and an updated curriculum version can be imported for a new batch without touching older ones.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Curriculum</label>
            <select value={importCurriculumId} onChange={(e) => setImportCurriculumId(e.target.value)}>
              {curricula.map((c) => <option key={c.id} value={c.id}>{c.authority} {c.title} ({c.version})</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Into Batch</label>
            <select value={importBatchId} onChange={(e) => setImportBatchId(e.target.value)}>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
            </select>
          </div>
          <button onClick={importHec} disabled={loading} className="btn btn-brass">{loading ? "Importing…" : "Import Courses"}</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Credits</th><th>Type</th><th>Semester</th><th>Source</th><th>Subject Expert</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={9} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
            {courses.map((c) => editingId === c.id ? (
              <tr key={c.id}>
                <td colSpan={9}>
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
                <td style={{ fontSize: 11.5, color: "var(--slate)" }}>{c.batchName || "—"}</td>
                <td>{c.code}</td><td>{c.title}</td><td>{c.creditHours}</td><td>{c.courseType}</td>
                <td>{c.semesterNumber ?? "—"}</td>
                <td>{c.fromHec ? <span style={{ color: "var(--sage)" }}>Imported</span> : "Manual"}</td>
                <td>
                  {c.fromBenchmark && (
                    <span style={{ fontSize: 10, background: "#F4EFE1", color: "var(--brass-dark)", padding: "2px 7px", borderRadius: 2, marginRight: 6 }}>
                      Pre-filled from prior batch
                    </span>
                  )}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: 14 }}>
            <div className="field"><label>Course Code</label><input name="code" placeholder="MT 1103" required /></div>
            <div className="field"><label>Course Title</label><input name="title" placeholder="Discrete Structures" required /></div>
            <div className="field"><label>Credit Hours</label><input name="creditHours" type="number" placeholder="3" required /></div>
            <div className="field">
              <label>Batch</label>
              <select value={addBatchId} onChange={(e) => setAddBatchId(e.target.value)}>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Course"}</button>
        </form>
      </div>
    </>
  );
}
