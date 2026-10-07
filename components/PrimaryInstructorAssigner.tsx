"use client";

import { useState, useEffect } from "react";
import DownloadButton from "./DownloadButton";
import { withProgress } from "../lib/busy";

type Course = { id: string; code: string; title: string; instructorId: string | null; instructorName: string | null; batchLabel: string; degreeProgram: string; semesterNumber: number | null; approval?: string; approvalNote?: string | null; response?: string; responseNote?: string | null };
type Faculty = { id: string; name: string };

export default function PrimaryInstructorAssigner() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [semesterFilter, setSemesterFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");

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
      const res = await withProgress("Applying uploaded Excel…", () => fetch("/api/assigner/primary-instructors/import", { method: "POST", body: formData }));
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

  const semesterOptions = Array.from(new Set(courses.map((c) => c.semesterNumber).filter((n): n is number => n !== null))).sort((a, b) => a - b);
  const programOptions = Array.from(new Set(courses.map((c) => c.degreeProgram).filter(Boolean))).sort();
  const batchOptions = Array.from(new Set(courses.map((c) => c.batchLabel))).sort();
  const unassignedCount = courses.filter((c) => !c.instructorId).length;
  // Unassigned courses float to the top so the work left is always in view;
  // within each group the server's code order is kept.
  const shown = courses
    .filter((c) => {
      if (unassignedOnly && c.instructorId) return false;
      if (semesterFilter && String(c.semesterNumber) !== semesterFilter) return false;
      if (programFilter && c.degreeProgram !== programFilter) return false;
      if (batchFilter && c.batchLabel !== batchFilter) return false;
      return true;
    })
    .sort((a, b) => Number(!!a.instructorId) - Number(!!b.instructorId));
  const selStyle = { padding: "5px 8px", border: "1px solid var(--line)", fontSize: 12.5 } as const;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Primary Instructor Assignment</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Sets each course's main instructor of record — separate from the section-count matrix below, which
        handles additional sections when a course has more than one.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <DownloadButton url="/api/assigner/primary-instructors/export" label="Download as Excel" className="btn" style={{ fontSize: 12, padding: "5px 10px" }} />
        <label className="btn" style={{ fontSize: 12, padding: "5px 10px", cursor: importing ? "wait" : "pointer" }}>
          {importing ? "Uploading…" : "Upload edited Excel"}
          <input type="file" accept=".xlsx" onChange={handleImport} disabled={importing} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
          Unassigned only ({unassignedCount})
        </label>
        <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} style={selStyle}>
          <option value="">All semesters</option>
          {semesterOptions.map((n) => <option key={n} value={n}>Semester {n}</option>)}
        </select>
        <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} style={selStyle}>
          <option value="">All programs</option>
          {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} style={selStyle}>
          <option value="">All batches</option>
          {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: "var(--slate)" }}>Showing {shown.length} of {courses.length}</span>
      </div>
      {importResult && (
        <div style={{ fontSize: 12, background: "#F0FBF4", border: "1px solid var(--sage)", padding: 8, marginBottom: 10 }}>
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
            {courses.length > 0 && shown.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>Nothing matches these filters.</td></tr>}
            {shown.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.batchLabel}>{c.batchLabel}</td>
                <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.code}</td>
                <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.title}>{c.title}</td>
                <td>
                  <select defaultValue={c.instructorId || ""} onChange={(e) => assign(c.id, e.target.value)} disabled={busyId === c.id} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
                    <option value="">— Unassigned —</option>
                    {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  {c.response === "PENDING" && <div style={{ fontSize: 11.5, color: "#96650F", marginTop: 3 }}>Waiting for them to accept</div>}
                  {c.response === "DECLINED" && !c.instructorId && <div style={{ fontSize: 11.5, color: "#b3261e", marginTop: 3 }}>Declined{c.responseNote ? `: ${c.responseNote}` : ""} — choose someone else</div>}
                  {c.approval === "PENDING" && <div style={{ fontSize: 11.5, color: "#96650F", marginTop: 3 }}>Waiting for Head of Department approval</div>}
                  {c.approval === "REJECTED" && <div style={{ fontSize: 11.5, color: "#b3261e", marginTop: 3 }}>Rejected by Head{c.approvalNote ? `: ${c.approvalNote}` : ""} — choose another teacher</div>}
                  {c.approval === "APPROVED" && c.instructorId && <div style={{ fontSize: 11.5, color: "var(--sage)", marginTop: 3 }}>Approved</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
