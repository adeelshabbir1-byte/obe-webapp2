"use client";

import { useState } from "react";

export default function CourseDescriptionFieldsForm({ courseId, initial }: {
  courseId: string;
  initial: { textbook: string; referenceMaterial: string; catalogDescription: string; programmingAssignmentsNote: string; labInstructorName: string };
}) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setOk(false);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/subjectexpert/courses/${courseId}/description-fields`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        textbook: fd.get("textbook"), referenceMaterial: fd.get("referenceMaterial"),
        catalogDescription: fd.get("catalogDescription"), programmingAssignmentsNote: fd.get("programmingAssignmentsNote"),
        labInstructorName: fd.get("labInstructorName"),
      }),
    });
    setOk(true); setLoading(false);
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>Additional Course Information</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>Feeds into the Course Description Form and Course Monitoring Form reports.</p>
      {ok && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      <form onSubmit={onSubmit}>
        <div className="field"><label>Catalog Description</label><textarea name="catalogDescription" defaultValue={initial.catalogDescription} rows={3} style={{ width: "100%", padding: "8px", border: "1px solid var(--line)" }} /></div>
        <div className="field"><label>Textbook</label><input name="textbook" defaultValue={initial.textbook} /></div>
        <div className="field"><label>Reference Material</label><input name="referenceMaterial" defaultValue={initial.referenceMaterial} /></div>
        <div className="field"><label>Programming Assignments Note</label><textarea name="programmingAssignmentsNote" defaultValue={initial.programmingAssignmentsNote} rows={2} style={{ width: "100%", padding: "8px", border: "1px solid var(--line)" }} /></div>
        <div className="field"><label>Lab Instructor Name (if any)</label><input name="labInstructorName" defaultValue={initial.labInstructorName} /></div>
        <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}
