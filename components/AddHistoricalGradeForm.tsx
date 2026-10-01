"use client";
import { useState } from "react";

// A single manual grade entry, for a batch that's mostly already in the
// system but missing one course, or a one-off correction — the bulk
// upload page is for backfilling a whole batch's history at once.
export default function AddHistoricalGradeForm({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [creditHours, setCreditHours] = useState("3");
  const [grade, setGrade] = useState("");
  const [termName, setTermName] = useState("Fall");
  const [termYear, setTermYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/students/${studentId}/historical-grade`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode, courseTitle, creditHours, grade, termName, termYear }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusy(false); return; }
      setDone(true); setBusy(false);
      setCourseCode(""); setCourseTitle(""); setGrade("");
      setTimeout(() => window.location.reload(), 900);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn btn-brass no-print" style={{ fontSize: 11.5, padding: "4px 10px", marginBottom: 10 }}>+ Add Historical Grade</button>;
  }

  return (
    <div className="card no-print" style={{ marginBottom: 10 }}>
      <h3 style={{ fontSize: 13, marginBottom: 8 }}>Add Historical Grade</h3>
      {error && <div className="err">{error}</div>}
      {done && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>Saved — refreshing…</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="Course Code" style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)", width: 110 }} />
        <input value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Course Title" style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)", flex: 1, minWidth: 160 }} />
        <input value={creditHours} onChange={(e) => setCreditHours(e.target.value)} placeholder="Cr. Hrs." type="number" style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)", width: 70 }} />
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade (e.g. B+, W)" style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)", width: 110 }} />
        <select value={termName} onChange={(e) => setTermName(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)" }}>
          <option value="Fall">Fall</option>
          <option value="Spring">Spring</option>
          <option value="Summer">Summer</option>
        </select>
        <input value={termYear} onChange={(e) => setTermYear(e.target.value)} placeholder="Year" type="number" style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)", width: 80 }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={busy || !courseCode || !courseTitle || !grade} className="btn btn-brass" style={{ fontSize: 11.5, padding: "4px 12px" }}>{busy ? "Saving…" : "Save"}</button>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn" style={{ fontSize: 11.5, padding: "4px 12px" }}>Cancel</button>
      </div>
    </div>
  );
}
