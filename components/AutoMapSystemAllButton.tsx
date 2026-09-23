"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoMapSystemAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; alreadyMapped: number; skippedNoPlo: number; skippedNoSuggestion: number; batchesTouched: number } | null>(null);

  async function run() {
    if (!confirm("This bulk-creates mappings inferred from CLO wording (not actual HEC tags) across every batch — review them afterward rather than treating them as final. Continue?")) return;
    setLoading(true); setError(""); setResult(null); setProgress(null);
    let offset = 0;
    let totalCreated = 0, totalAlreadyMapped = 0, totalSkippedNoPlo = 0, totalSkippedNoSuggestion = 0, batchesTouched = 0, totalBatches = 0;
    try {
      while (true) {
        const res = await fetch("/api/omc/plo-matrix/auto-map-system-all", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, pageSize: 5 }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }

        totalCreated += data.created; totalAlreadyMapped += data.alreadyMapped;
        totalSkippedNoPlo += data.skippedNoPlo; totalSkippedNoSuggestion += data.skippedNoSuggestion;
        batchesTouched += data.batchesProcessed.length; totalBatches = data.totalBatches;
        setProgress({ done: batchesTouched, total: totalBatches });

        if (data.done) break;
        offset = data.nextOffset;
      }
      setResult({ created: totalCreated, alreadyMapped: totalAlreadyMapped, skippedNoPlo: totalSkippedNoPlo, skippedNoSuggestion: totalSkippedNoSuggestion, batchesTouched });
      setLoading(false); setProgress(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); setProgress(null); }
  }

  return (
    <div className="card" style={{ background: "#FBEED2" }}>
      <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>⚠️ Auto-Map from System Suggestions — All Batches (Unverified)</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Same as System Suggestions, but across every batch in the institution at once. These come from
        keyword-based inference, not an actual HEC tag — run "Auto-Map from HEC — All Batches" first, and
        review what this creates rather than treating it as final. Only fills in gaps.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={run} disabled={loading} className="btn" style={{ background: "#96650F", borderColor: "#96650F", color: "#fff" }}>
        {progress ? `Mapping… ${progress.done}/${progress.total} batches` : loading ? "Mapping…" : "Auto-Map from System Suggestions — All Batches"}
      </button>
      {result && (
        <p style={{ fontSize: 12, marginTop: 10, color: "#96650F" }}>
          Across {result.batchesTouched} batch(es): created {result.created} new mapping(s) — review these. {result.alreadyMapped} already existed,
          {" "}{result.skippedNoPlo} skipped (no matching PLO number in that batch), {result.skippedNoSuggestion} course(s) had no system suggestion on record.
        </p>
      )}
    </div>
  );
}
