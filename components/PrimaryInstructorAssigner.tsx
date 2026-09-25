"use client";

import { useState, useEffect } from "react";

type Course = { id: string; code: string; title: string; instructorId: string | null; instructorName: string | null; batchLabel: string };
type Faculty = { id: string; name: string };

export default function PrimaryInstructorAssigner() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  async function load() {
    try {
      const res = await fetch("/api/assigner/primary-instructors");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setFaculty(data.faculty); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

  async function assign(courseId: string, instructorId: string) {
    setBusyId(courseId); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/assign-instructor`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructorId: instructorId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null); setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/assigner/primary-instructors/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed."); setImporting(false); return; }
      setImportResult(data);
      await load();
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Primary Instructor Assignment</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Sets each course's main instructor of record — separate from the section-count matrix below, which
        handles additional sections when a course has more than one.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <a href="/api/assigner/primary-instructors/export" className="btn btn-export" style={{ fontSize: 12, padding: "5px 10px" }}>
          Download as Excel
        </a>
        <label className="btn btn-import" style={{ fontSize: 12, padding: "5px 10px", cursor: importing ? "wait" : "pointer" }}>
          {importing ? "Uploading…" : "Upload edited Excel"}
          <input type="file" accept=".xlsx" onChange={handleImport} disabled={importing} style={{ display: "none" }} />
        </label>
      </div>
      {importResult && (
        <div style={{ fontSize: 12, background: "#ECFBF4", border: "1px solid var(--sage)", padding: 8, marginBottom: 10 }}>
          Applied: {importResult.updated} assignment(s) set, {importResult.cleared} cleared, {importResult.unchanged} already matched.
          {importResult.rowsSkipped > 0 && <> {importResult.rowsSkipped} row(s) skipped (didn't match a course, or the name didn't match a unique faculty member — check for hand-edited ids).</>}
          {importResult.unrecognizedNames?.length > 0 && <> Names not recognized: {importResult.unrecognizedNames.join(", ")}.</>}
        </div>
      )}
      {error && <div className="err">{error}</div>}
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
      ) : (
        <table style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "22%" }} /><col style={{ width: "12%" }} /><col style={{ width: "36%" }} /><col style={{ width: "30%" }} />
          </colgroup>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Instructor</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.batchLabel}>{c.batchLabel}</td>
                <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.code}</td>
                <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.title}>{c.title}</td>
                <td>
                  <select defaultValue={c.instructorId || ""} onChange={(e) => assign(c.id, e.target.value)} disabled={busyId === c.id} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
                    <option value="">— Unassigned —</option>
                    {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
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
