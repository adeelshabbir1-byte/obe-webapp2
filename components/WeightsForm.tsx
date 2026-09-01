"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WeightsForm({ courseId, current }: {
  courseId: string;
  current: { assignmentPct: number; quizPct: number; projectPct: number; labPct: number; midtermPct: number; finalPct: number };
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(""); setOk(false); setPending(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/weights`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentPct: fd.get("assignmentPct"), quizPct: fd.get("quizPct"), projectPct: fd.get("projectPct"),
          labPct: fd.get("labPct"), midtermPct: fd.get("midtermPct"), finalPct: fd.get("finalPct"),
        }),
      });
      const data = await res.json();
      if (res.status === 202 && data.pendingApproval) {
        setPending(data.violations || []); setLoading(false); router.refresh(); return;
      }
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Assessment Weights</h3>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#E4EEE8", color: "var(--sage)", border: "1px solid #BEDACB", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      {pending && (
        <div style={{ background: "#F4EFE1", color: "var(--brass-dark)", border: "1px solid #E3D4B0", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>
          Outside policy range — sent to the OMC for approval instead of saving directly:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{pending.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
      )}
      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="field"><label>Assignment %</label><input name="assignmentPct" type="number" defaultValue={current.assignmentPct} /></div>
          <div className="field"><label>Quiz %</label><input name="quizPct" type="number" defaultValue={current.quizPct} /></div>
          <div className="field"><label>Project %</label><input name="projectPct" type="number" defaultValue={current.projectPct} /></div>
          <div className="field"><label>Lab %</label><input name="labPct" type="number" defaultValue={current.labPct} /></div>
          <div className="field"><label>Midterm %</label><input name="midtermPct" type="number" defaultValue={current.midtermPct} /></div>
          <div className="field"><label>Final %</label><input name="finalPct" type="number" defaultValue={current.finalPct} /></div>
        </div>
        <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Saving…" : "Save Weights"}</button>
        <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 6 }}>Must total exactly 100%.</div>
      </form>
    </div>
  );
}
