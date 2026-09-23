"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Deliberately separate from AutoMapHecButton, and deliberately looks
// different (amber, a confirm prompt) — these mappings come from
// keyword-based inference on each CLO's wording, not an actual HEC
// document tag, so they're a starting point to review, not a verified
// source of truth the way HEC's own tags are.
export default function AutoMapSystemButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; alreadyMapped: number; skippedNoPlo: number; skippedNoSuggestion: number } | null>(null);

  async function run() {
    if (!confirm("These mappings are inferred from CLO wording, not an actual HEC tag — review them afterward rather than treating them as final. Continue?")) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/omc/plo-matrix/auto-map-system", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResult(data); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card" style={{ background: "#FBEED2" }}>
      <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>⚠️ Auto-Map from System Suggestions (Unverified)</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Bulk-creates course-PLO mappings from CLOs whose PLO was <em>inferred</em> by keyword matching, not
        tagged by HEC's own document — use "Auto-Map from HEC" first; use this only for courses that have
        no HEC tag at all, and review what it creates. Only fills in gaps, never overwrites or removes
        anything already set.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={run} disabled={loading} className="btn" style={{ background: "#96650F", borderColor: "#96650F", color: "#fff" }}>
        {loading ? "Mapping…" : "Auto-Map from System Suggestions"}
      </button>
      {result && (
        <p style={{ fontSize: 12, marginTop: 10, color: "#96650F" }}>
          Created {result.created} new mapping(s) — review these. {result.alreadyMapped} already existed, {result.skippedNoPlo} skipped (no matching PLO number in this batch), {result.skippedNoSuggestion} course(s) had no system suggestion on record.
        </p>
      )}
    </div>
  );
}
