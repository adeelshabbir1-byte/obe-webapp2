"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoadHecContentButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/load-hec-content`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setDone(true); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (done) return null;

  return (
    <div className="card" style={{ borderColor: "var(--brass)" }}>
      <h3 style={{ fontSize: 14, marginBottom: 6, color: "var(--brass-dark)" }}>Get a Head Start from HEC</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 10 }}>
        This course has HEC starting content available (CLOs and a 32-lecture topic draft) that wasn't loaded when it was created.
        Load it now as a fully editable draft — nothing here is final.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={load} disabled={loading} className="btn btn-brass">{loading ? "Loading…" : "Load HEC Starting Content"}</button>
    </div>
  );
}
