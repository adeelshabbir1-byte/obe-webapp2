"use client";

import { useState } from "react";

type Instructor = { id: string; name: string; role: string };

// Click-to-assign instructor cell for the Program Semester Map. Anyone
// without assign rights (e.g. Subject Expert, who can view this page but
// isn't in the assign-instructor API's allowed roles) gets the old plain
// text back — only Institute Head/Coordinator/OMC get the clickable picker.
export default function InstructorAssignCell({ courseId, initialInstructorId, initialInstructorName, canAssign }: {
  courseId: string; initialInstructorId: string | null; initialInstructorName: string | null; canAssign: boolean;
}) {
  const [instructorId, setInstructorId] = useState(initialInstructorId);
  const [instructorName, setInstructorName] = useState(initialInstructorName);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<Instructor[] | null>(null);
  const [error, setError] = useState("");

  async function startEditing() {
    setEditing(true); setError("");
    if (candidates) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/eligible-instructors`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Couldn't load instructors."); setLoading(false); return; }
      setCandidates(data.instructors || []);
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function save(newInstructorId: string) {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/assign-instructor`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructorId: newInstructorId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      const picked = candidates?.find((c) => c.id === newInstructorId) || null;
      setInstructorId(newInstructorId || null);
      setInstructorName(picked?.name ?? null);
      setSaving(false);
      setEditing(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  if (!canAssign) {
    return (
      <div style={{ fontSize: 11, marginTop: 2 }}>
        {instructorName || <span style={{ color: "var(--rust)" }}>No instructor assigned</span>}
      </div>
    );
  }

  if (!editing) {
    return (
      <div style={{ fontSize: 11, marginTop: 2 }}>
        <button
          type="button"
          onClick={startEditing}
          style={{ background: "none", border: "none", padding: 0, font: "inherit", textAlign: "left", cursor: "pointer", textDecoration: "underline", color: instructorName ? "inherit" : "var(--rust)" }}
        >
          {instructorName || "No instructor assigned — click to assign"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontSize: 11, marginTop: 2 }}>
      {loading && <span style={{ color: "var(--slate)" }}>Loading…</span>}
      {!loading && (
        <select
          autoFocus
          defaultValue={instructorId || ""}
          disabled={saving}
          onChange={(e) => save(e.target.value)}
          style={{ fontSize: 11, padding: "2px 4px", border: "1px solid var(--line)", maxWidth: "100%" }}
        >
          <option value="">— Unassigned —</option>
          {candidates?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role === "SUBJECT_EXPERT" ? " (SE)" : ""}</option>)}
        </select>
      )}
      {!loading && !saving && (
        <button type="button" onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 10.5, textDecoration: "underline", cursor: "pointer", marginLeft: 6, padding: 0 }}>
          Cancel
        </button>
      )}
      {saving && <span style={{ color: "var(--slate)", marginLeft: 6 }}>Saving…</span>}
      {error && <div style={{ color: "var(--rust)", marginTop: 2 }}>{error}</div>}
    </div>
  );
}
