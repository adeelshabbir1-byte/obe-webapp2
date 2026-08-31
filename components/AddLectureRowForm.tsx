"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddLectureRowForm({ courseId, clos }: { courseId: string; clos: { id: string; code: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/lecture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: fd.get("week"), lectureNumber: fd.get("lectureNumber"), topic: fd.get("topic"),
          subtopic: fd.get("subtopic"), cloId: fd.get("cloId") || null, bloomLevel: fd.get("bloomLevel") || null,
          weightPct: fd.get("weightPct") || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add Lecture Row</h3>
      {error && <div className="err">{error}</div>}
      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <div className="field"><label>Week</label><input name="week" type="number" placeholder="1" required /></div>
          <div className="field"><label>Lecture #</label><input name="lectureNumber" type="number" placeholder="1" required /></div>
          <div className="field">
            <label>CLO</label>
            <select name="cloId">
              <option value="">—</option>
              {clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Bloom's Level</label>
            <select name="bloomLevel">
              <option value="">—</option>
              <option value="C1">C1</option><option value="C2">C2</option><option value="C3">C3</option>
              <option value="C4">C4</option><option value="C5">C5</option><option value="C6">C6</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div className="field"><label>Topic</label><input name="topic" placeholder="Propositional Logic" required /></div>
          <div className="field"><label>Sub Topic</label><input name="subtopic" placeholder="Truth Table, Tautology" /></div>
        </div>
        <div className="field" style={{ maxWidth: 200 }}><label>Assessment Weight %</label><input name="weightPct" type="number" placeholder="0" /></div>
        <button className="btn btn-brass" type="submit" disabled={loading || clos.length === 0}>{loading ? "Adding…" : "Add Row"}</button>
        {clos.length === 0 && <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>Add at least one CLO first.</div>}
      </form>
    </div>
  );
}
