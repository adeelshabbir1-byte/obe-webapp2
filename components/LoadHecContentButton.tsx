"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoadHecContentButton({ courseId, hasExistingClos }: { courseId: string; hasExistingClos: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load(overwrite: boolean) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/load-hec-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwrite }),
      });
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
        This course has HEC starting content available (CLOs and a 32-lecture topic draft).
        {hasExistingClos
          ? " You already have CLOs entered — loading HEC content now will overwrite your existing CLOs and lecture plan with HEC's version."
          : " Load it now as a fully editable draft — nothing here is final."}
      </p>
      {error && <div className="err">{error}</div>}
      {!hasExistingClos && (
        <button onClick={() => load(false)} disabled={loading} className="btn btn-brass">{loading ? "Loading…" : "Load HEC Starting Content"}</button>
      )}
      {hasExistingClos && !confirming && (
        <button onClick={() => setConfirming(true)} disabled={loading} className="btn btn-brass">Overwrite with HEC Content</button>
      )}
      {hasExistingClos && confirming && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>This replaces your current CLOs and lecture plan. Are you sure?</span>
          <button onClick={() => load(true)} disabled={loading} className="btn btn-brass">{loading ? "Overwriting…" : "Yes, overwrite"}</button>
          <button onClick={() => setConfirming(false)} disabled={loading} className="btn">Cancel</button>
        </div>
      )}
    </div>
  );
}
