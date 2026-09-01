"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Policy = {
  courseType: string; assignmentMin: number; assignmentMax: number; quizMin: number; quizMax: number;
  projectMin: number; projectMax: number; labMin: number; labMax: number; midtermMin: number; midtermMax: number;
  finalMin: number; finalMax: number;
};

const FIELDS: { key: string; label: string }[] = [
  { key: "assignment", label: "Assignment" }, { key: "quiz", label: "Quiz" }, { key: "project", label: "Project" },
  { key: "lab", label: "Lab" }, { key: "midterm", label: "Midterm" }, { key: "final", label: "Final" },
];

export default function WeightPolicyManager({ initialPolicies }: { initialPolicies: Policy[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>, courseType: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, any> = { courseType };
    for (const f of FIELDS) {
      body[`${f.key}Min`] = fd.get(`${f.key}Min`);
      body[`${f.key}Max`] = fd.get(`${f.key}Max`);
    }
    try {
      const res = await fetch("/api/omc/weight-policy", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingType(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {initialPolicies.map((p) => (
        <div className="card" key={p.courseType}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editingType === p.courseType ? 12 : 0 }}>
            <h3 style={{ fontSize: 14 }}>{p.courseType}</h3>
            <button onClick={() => setEditingType(editingType === p.courseType ? null : p.courseType)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
              {editingType === p.courseType ? "Cancel" : "Edit Ranges"}
            </button>
          </div>

          {editingType === p.courseType ? (
            <form onSubmit={(e) => save(e, p.courseType)}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>{f.label} %</label>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input name={`${f.key}Min`} type="number" min={0} max={100} defaultValue={(p as any)[`${f.key}Min`]} style={{ width: 50, padding: "5px 6px", border: "1px solid var(--line)" }} required />
                      <span style={{ fontSize: 11, color: "var(--slate)" }}>–</span>
                      <input name={`${f.key}Max`} type="number" min={0} max={100} defaultValue={(p as any)[`${f.key}Max`]} style={{ width: 50, padding: "5px 6px", border: "1px solid var(--line)" }} required />
                    </div>
                  </div>
                ))}
              </div>
              <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "6px 14px", fontSize: 12 }}>{loading ? "Saving…" : "Save Policy"}</button>
            </form>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
              {FIELDS.map((f) => (
                <span key={f.key} style={{ fontSize: 12, color: "var(--slate)" }}>
                  {f.label}: <b style={{ color: "var(--ink)" }}>{(p as any)[`${f.key}Min`]}–{(p as any)[`${f.key}Max`]}%</b>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
