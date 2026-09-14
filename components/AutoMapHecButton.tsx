"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoMapHecButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; alreadyMapped: number; skippedNoPlo: number; skippedNoSuggestion: number } | null>(null);

  async function run() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/omc/plo-matrix/auto-map-hec", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResult(data); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Auto-Map from HEC</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Bulk-creates course-PLO mappings for this batch from HEC's own suggested mapping (matched by course
        code) — only fills in gaps, never overwrites or removes anything already set.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={run} disabled={loading} className="btn btn-brass">{loading ? "Mapping…" : "Auto-Map from HEC"}</button>
      {result && (
        <p style={{ fontSize: 12, marginTop: 10, color: "var(--sage)" }}>
          Created {result.created} new mapping(s). {result.alreadyMapped} already existed, {result.skippedNoPlo} skipped (no matching PLO number in this batch), {result.skippedNoSuggestion} course(s) had no HEC suggestion on record.
        </p>
      )}
    </div>
  );
}
