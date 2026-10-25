"use client";

import { withProgress } from "../lib/busy";

import { useState } from "react";
import SortableTable from "./SortableTable";
import Link from "next/link";

type Batch = { id: string; degreeProgram: string; batchName: string; startTerm: string; startYear: number; studentCount: number; enrolledCount: number; courseCount: number; credits?: { total: number; bySemester: { sem: number; cr: number }[] }; registrationOpen: boolean; advisorId: string | null };
type Faculty = { id: string; name: string; group?: string; dept?: string | null; advising?: string[]; sections?: number };

export default function BatchesManager({ initialBatches, faculty }: { initialBatches: Batch[]; faculty: Faculty[] }) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyResultMsg, setCopyResultMsg] = useState("");
  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [enrollResultMsg, setEnrollResultMsg] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<Batch | null>(null);
  const [pickQ, setPickQ] = useState("");

  async function setAdvisor(batch: Batch, advisorId: string) {
    setBusyId(batch.id); setError("");
    try {
      const res = await fetch(`/api/coordinator/batches/${batch.id}/set-advisor`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ advisorId: advisorId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setBatches((prev) => prev.map((b) => b.id === batch.id ? { ...b, advisorId: data.advisorId } : b));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function toggleRegistration(batch: Batch) {
    setBusyId(batch.id); setError("");
    try {
      const res = await fetch(`/api/coordinator/batches/${batch.id}/toggle-registration`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: !batch.registrationOpen }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setBatches((prev) => prev.map((b) => b.id === batch.id ? { ...b, registrationOpen: data.registrationOpen } : b));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function runDefaultEnrollment(batch: Batch) {
    if (!confirm(`Enroll every student in ${batch.batchName} into their own current semester's Core/IDS/GE/Lab courses (never Electives, and never touching anyone already enrolled)?`)) return;
    setBusyId(batch.id); setError("");
    try {
      const res = await withProgress(`Enrolling students in ${batch.batchName}…`, () => fetch(`/api/coordinator/batches/${batch.id}/run-default-enrollment`, { method: "POST" }));
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      const extra = [
        data.fromPlan?.length ? `${data.fromPlan.length} registered from their advisor-locked plan` : "",
        data.waitingForAdvisor?.length ? `${data.waitingForAdvisor.length} with low CGPA / warning / probation left for their advisor (no locked plan yet)` : "",
        data.blockedByRules?.length ? `${data.blockedByRules.length} course(s) held back by registration rules` : "",
      ].filter(Boolean).join("; ");
      setEnrollResultMsg((prev) => ({ ...prev, [batch.id]: `${data.totalEnrolled} new enrollment(s) across ${data.studentsAffected} of ${data.totalStudents} student(s).${extra ? " " + extra + "." : ""}` }));
      if (data.blockedByRules?.length || data.waitingForAdvisor?.length) alert([
        data.waitingForAdvisor?.length ? `Left for the advisor (low CGPA / warning / probation, no locked plan):\n${data.waitingForAdvisor.join(", ")}` : "",
        data.blockedByRules?.length ? `Held back by registration rules:\n${data.blockedByRules.join("\n")}` : "",
      ].filter(Boolean).join("\n\n"));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function addBatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          degreeProgram: fd.get("degreeProgram"), batchName: fd.get("batchName"),
          startTerm: fd.get("startTerm"), startYear: fd.get("startYear"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      // No silent copy: the Program Lead now chooses where the new batch's courses come from.
      window.location.href = `/coordinator/courses?batchId=${data.batch.id}&pick=1#Add%20courses`;
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveStudentCount(batchId: string, value: string) {
    setBusyId(batchId); setError("");
    try {
      const res = await fetch(`/api/coordinator/batches/${batchId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentCount: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setBatches((prev) => prev.map((b) => b.id === batchId ? { ...b, studentCount: Number(value) } : b));
      setEditingCountId(null); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function removeAllBatches() {
    const typed = prompt(`This permanently deletes EVERY batch you have (${batches.length} total) — every course, student, GA, and all their data across all of them. This cannot be undone.\n\nType exactly: DELETE ALL BATCHES`);
    if (typed !== "DELETE ALL BATCHES") { if (typed !== null) alert("Confirmation phrase didn't match — nothing was deleted."); return; }

    // Delete one batch at a time from here, rather than one big server-side
    // loop — a single request deleting everything risks the platform's
    // execution time limit on a large curriculum, which could leave things
    // partially deleted mid-operation. This way each request only has to
    // finish one batch, and progress is visible as it goes.
    setBusyId("__all__"); setError("");
    setBulkProgress({ done: 0, total: batches.length });
    const failures: string[] = [];
    const succeededIds: string[] = [];
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      try {
        const res = await fetch(`/api/coordinator/batches/${b.id}`, { method: "DELETE" });
        if (!res.ok) { const data = await res.json().catch(() => ({})); failures.push(`${b.batchName}: ${data.error || "failed"}`); }
        else succeededIds.push(b.id);
      } catch (err: any) {
        failures.push(`${b.batchName}: ${err.message}`);
      }
      setBulkProgress({ done: i + 1, total: batches.length });
    }
    setBatches((prev) => prev.filter((b) => !succeededIds.includes(b.id)));
    setBusyId(null); setBulkProgress(null);
    if (failures.length > 0) setError(`Deleted ${succeededIds.length}/${batches.length}, but some failed: ${failures.join("; ")}`);
  }

  async function removeBatch(batchId: string, batchName: string) {
    const typed = prompt(`This permanently deletes the "${batchName}" batch — every course, student, GA, and all their data. This cannot be undone.\n\nType the batch name exactly to confirm: ${batchName}`);
    if (typed !== batchName) { if (typed !== null) alert("Name didn't match — nothing was deleted."); return; }
    setBusyId(batchId); setError("");
    try {
      const res = await withProgress(`Deleting batch ${batchName} and all its data…`, () => fetch(`/api/coordinator/batches/${batchId}`, { method: "DELETE" }));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {copyResultMsg && <p style={{ fontSize: 12.5, color: "var(--sage)" }}>{copyResultMsg}</p>}
      {batches.length > 0 && (
        <div className="card" style={{ borderColor: "var(--rust)", background: "#FFF5F0" }}>
          <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 8 }}>
            <b>Danger zone.</b> Deletes every batch you have ({batches.length} total) and everything under them — permanent, no undo.
          </p>
          <button onClick={removeAllBatches} disabled={busyId === "__all__"} style={{ background: "var(--rust)", color: "#fff", border: "none", padding: "6px 14px", fontSize: 12.5, cursor: "pointer" }}>
            {busyId === "__all__" ? "Deleting…" : "Delete ALL Batches"}
          </button>
          {bulkProgress && (
            <p style={{ fontSize: 12, color: "var(--rust)", marginTop: 8 }}>
              Deleting batch {bulkProgress.done} of {bulkProgress.total}… (one at a time, so a large curriculum doesn't risk timing out mid-operation)
            </p>
          )}
        </div>
      )}
      <div className="card">
        <SortableTable>
          <thead><tr><th>Degree Program</th><th>Batch</th><th>Semester 1 Starts</th><th>Planned Intake</th><th>Enrolled</th><th>Courses Imported</th><th>Credit Hours</th><th>Registration</th><th>Advisor</th><th></th></tr></thead>
          <tbody>
            {batches.length === 0 && <tr><td colSpan={10} style={{ color: "var(--slate)" }}>No batches yet.</td></tr>}
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.degreeProgram}</td><td>{b.batchName}</td><td>{b.startTerm} {b.startYear}</td>
                <td>
                  {editingCountId === b.id ? (
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="number" min={0} defaultValue={b.studentCount} disabled={busyId === b.id}
                        onKeyDown={(e) => { if (e.key === "Enter") saveStudentCount(b.id, (e.target as HTMLInputElement).value); }}
                        style={{ width: 70, padding: "4px 6px", border: "1px solid var(--line)" }}
                        id={`count-${b.id}`}
                      />
                      <button onClick={() => saveStudentCount(b.id, (document.getElementById(`count-${b.id}`) as HTMLInputElement).value)} disabled={busyId === b.id} className="btn btn-brass" style={{ padding: "3px 8px", fontSize: 11 }}>Save</button>
                    </span>
                  ) : (
                    <span>{b.studentCount} <button onClick={() => setEditingCountId(b.id)} className="act act-primary" style={{ marginLeft: 6 }}>Edit</button></span>
                  )}
                </td>
                <td>
                  {b.enrolledCount}
                  {b.enrolledCount !== b.studentCount && (
                    <div style={{ fontSize: 10, color: "var(--slate)" }}>
                      actual roster — {b.enrolledCount > b.studentCount ? "more" : "fewer"} than the planned intake above
                    </div>
                  )}
                </td>
                <td>{b.courseCount}</td>
                <td>
                  <b>{b.credits?.total ?? 0}</b>
                  {b.credits && b.credits.bySemester.length > 0 && (
                    <div style={{ fontSize: 10.5, color: "var(--slate)", lineHeight: 1.5, minWidth: 120 }}>
                      {b.credits.bySemester.map((x) => `S${x.sem}: ${x.cr}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td>
                  <button onClick={() => toggleRegistration(b)} disabled={busyId === b.id} className={b.registrationOpen ? "badge badge-ok" : "badge badge-warn"} style={{ border: "none", cursor: "pointer" }}>
                    {b.registrationOpen ? "Open" : "Closed"}
                  </button>
                  <button onClick={() => runDefaultEnrollment(b)} disabled={busyId === b.id} className="act act-primary" style={{ display: "block", marginTop: 4 }}>
                    Run Default Enrollment
                  </button>
                  {enrollResultMsg[b.id] && <div style={{ fontSize: 10, color: "var(--sage)", marginTop: 2 }}>{enrollResultMsg[b.id]}</div>}
                </td>
                <td>
                  <button type="button" className="act act-primary" disabled={busyId === b.id} onClick={() => { setPicking(b); setPickQ(""); }} title="Choose the batch's advisor — they stay with the batch through the degree">{faculty.find((f) => f.id === b.advisorId)?.name || "Assign advisor…"}</button>
                </td>
                <td><Link href={`/coordinator/courses?batchId=${b.id}`} className="act act-primary">View Courses</Link>
                <button onClick={() => removeBatch(b.id, b.batchName)} disabled={busyId === b.id} className="act act-danger" style={{ marginLeft: 10 }}>Delete Batch</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          Student count can change each semester as students leave or migrate in — update it whenever it changes.
        </p>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Create Batch</h3>
        <form onSubmit={addBatch}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            <div className="field"><label>Degree Program</label><input name="degreeProgram" placeholder="BS Computer Science" defaultValue="BS Computer Science" required /></div>
            <div className="field"><label>Batch Name</label><input name="batchName" placeholder="Fall 2026" required /></div>
            <div className="field">
              <label>Semester 1 Term</label>
              <select name="startTerm" required>
                <option value="Fall">Fall</option>
                <option value="Spring">Spring</option>
              </select>
            </div>
            <div className="field"><label>Semester 1 Year</label><input name="startYear" type="number" defaultValue={new Date().getFullYear()} required /></div>
          </div>
          <p style={{ fontSize: 11, color: "var(--slate)", marginTop: -8, marginBottom: 12 }}>
            This is when the batch's Semester 1 begins — used to automatically figure out which semester they're in as terms pass.
          </p>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Batch"}</button>
        </form>
      </div>
      {picking && (
        <div role="dialog" aria-label={`Advisor for ${picking.batchName}`} onClick={() => setPicking(null)} style={{ position: "fixed", inset: 0, background: "rgba(13,42,74,.35)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ margin: 0, width: "min(720px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><b style={{ fontSize: 16 }}>Advisor for {picking.degreeProgram} — {picking.batchName}</b><button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicking(null)}>Close</button></div>
            <p className="small-note" style={{ marginTop: 4 }}>Best case: one advisor per batch, who stays with it through the whole degree. Your program&apos;s teachers who advise no batch yet are listed first.</p>
            <input autoFocus placeholder="Search a name…" value={pickQ} onChange={(e) => setPickQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            {picking.advisorId && <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 8 }} onClick={async () => { await setAdvisor(picking, ""); setPicking(null); }}>Remove the current advisor</button>}
            {Array.from(new Set(faculty.map((f) => f.group || "Teachers"))).map((g) => { const fs = faculty.filter((f) => (f.group || "Teachers") === g && (!pickQ || f.name.toLowerCase().includes(pickQ.toLowerCase()))); return fs.length ? (
              <div key={g} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#556", textTransform: "uppercase", letterSpacing: ".04em", margin: "6px 0" }}>{g}</div>
                <table style={{ fontSize: 12.5, width: "100%" }}><tbody>{fs.map((f) => (
                  <tr key={f.id} style={f.id === picking.advisorId ? { background: "#EEF4FB" } : undefined}>
                    <td style={{ width: "34%" }}><b>{f.name}</b>{f.dept && <div className="small-note" style={{ margin: 0 }}>{f.dept}</div>}</td>
                    <td style={{ color: f.advising?.length ? "#B26A00" : "#2E7D32" }}>{f.advising?.length ? `Advising: ${f.advising.join(", ")}` : "Not advising any batch"}</td>
                    <td className="small-note">{f.sections || 0} course section(s) now</td>
                    <td style={{ textAlign: "right" }}><button type="button" className="btn btn-sm" disabled={busyId === picking.id || f.id === picking.advisorId} onClick={async () => { await setAdvisor(picking, f.id); setPicking(null); }}>{f.id === picking.advisorId ? "Current" : "Choose"}</button></td>
                  </tr>))}</tbody></table>
              </div>) : null; })}
          </div>
        </div>
      )}

    </>
  );
}
