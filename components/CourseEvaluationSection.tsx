"use client";

import { useState } from "react";

export default function CourseEvaluationSection({ courseId, initialObservations }: { courseId: string; initialObservations: string }) {
  const [observations, setObservations] = useState(initialObservations);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/observations`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ observations }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Something went wrong."); setSaving(false); return; }
      setSaved(true); setSaving(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Course Evaluation Form</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Write your end-of-term observations (one per line — each becomes a numbered point on the form), then
        download the full Course Evaluation Form with your CLO/PLO attainment auto-filled in.
      </p>
      {error && <div className="err">{error}</div>}
      <textarea
        value={observations} onChange={(e) => { setObservations(e.target.value); setSaved(false); }}
        rows={4} style={{ width: "100%", padding: 8, border: "1px solid var(--line)", fontSize: 13, marginBottom: 10 }}
        placeholder="e.g. 100% of concepts were covered as per course log. Student participation was encouraged throughout."
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {saved && <span style={{ color: "var(--sage)", fontSize: 12 }}>Saved.</span>}
        <button onClick={save} disabled={saving} className="btn btn-brass">{saving ? "Saving…" : "Save Observations"}</button>
        <a href={`/api/instructor/courses/${courseId}/evaluation-form`} className="btn btn-export" style={{ textDecoration: "none" }}>Download Course Evaluation Form (Word)</a>
      </div>
    </div>
  );
}
