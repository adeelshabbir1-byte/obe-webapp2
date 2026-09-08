"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Weights = { assignmentPct: number; quizPct: number; projectPct: number; labPct: number; midtermPct: number; finalPct: number };
type Policy = {
  assignmentMin: number; assignmentMax: number; quizMin: number; quizMax: number;
  projectMin: number; projectMax: number; labMin: number; labMax: number;
  midtermMin: number; midtermMax: number; finalMin: number; finalMax: number;
} | null;

const ROWS: { key: keyof Weights; label: string; minKey: string; maxKey: string }[] = [
  { key: "assignmentPct", label: "Assignment", minKey: "assignmentMin", maxKey: "assignmentMax" },
  { key: "quizPct", label: "Quiz", minKey: "quizMin", maxKey: "quizMax" },
  { key: "projectPct", label: "Project", minKey: "projectMin", maxKey: "projectMax" },
  { key: "labPct", label: "Lab", minKey: "labMin", maxKey: "labMax" },
  { key: "midtermPct", label: "Midterm", minKey: "midtermMin", maxKey: "midtermMax" },
  { key: "finalPct", label: "Final", minKey: "finalMin", maxKey: "finalMax" },
];

export default function WeightsForm({ courseId, current, policy }: { courseId: string; current: Weights; policy: Policy }) {
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

  const total = ROWS.reduce((s, r) => s + (current[r.key] ?? 0), 0);

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Assessment Weights</h3>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#CCFBF1", color: "var(--sage)", border: "1px solid #99F1E4", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      {pending && (
        <div style={{ background: "#E8E6FB", color: "var(--brass-dark)", border: "1px solid #C7C2F0", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>
          Outside policy range — sent to the OMC for approval instead of saving directly:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{pending.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
      )}
      <form onSubmit={onSubmit}>
        <table>
          <thead>
            <tr>
              <th>Assessment Tool</th>
              <th>OMC Min %</th>
              <th>OMC Max %</th>
              <th>Your %</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const min = policy ? (policy as any)[r.minKey] : null;
              const max = policy ? (policy as any)[r.maxKey] : null;
              return (
                <tr key={r.key}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
                  <td style={{ color: "var(--slate)" }}>{min !== null ? `${min}%` : "—"}</td>
                  <td style={{ color: "var(--slate)" }}>{max !== null ? `${max}%` : "—"}</td>
                  <td>
                    <input name={r.key} type="number" min={0} max={100} defaultValue={current[r.key]} style={{ width: 70, padding: "5px 6px", border: "1px solid var(--line)" }} />
                  </td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
              <td colSpan={3}></td>
              <td style={{ color: total === 100 ? "var(--sage)" : "var(--rust)" }}>{total}%</td>
            </tr>
          </tbody>
        </table>
        <button className="btn btn-brass" type="submit" disabled={loading} style={{ marginTop: 14 }}>{loading ? "Saving…" : "Save Weights"}</button>
        <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 6 }}>Must total exactly 100%.</div>
      </form>
    </div>
  );
}
