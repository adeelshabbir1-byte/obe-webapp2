"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddCloForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fd.get("code"), statement: fd.get("statement"), bloomLevel: fd.get("bloomLevel") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add CLO</h3>
      {error && <div className="err">{error}</div>}
      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="field"><label>CLO Code</label><input name="code" placeholder="CLO-1" required /></div>
          <div className="field">
            <label>Bloom's Level</label>
            <select name="bloomLevel" required>
              <option value="C1">C1 — Remember</option>
              <option value="C2">C2 — Understand</option>
              <option value="C3">C3 — Apply</option>
              <option value="C4">C4 — Analyze</option>
              <option value="C5">C5 — Evaluate</option>
              <option value="C6">C6 — Create</option>
            </select>
          </div>
        </div>
        <div className="field"><label>Outcome Statement</label><input name="statement" placeholder="Apply formal logic proofs to..." required /></div>
        <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add CLO"}</button>
      </form>
    </div>
  );
}
