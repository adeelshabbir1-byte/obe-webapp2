"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoMapHecAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; alreadyMapped: number; skippedNoPlo: number; skippedNoSuggestion: number; batchesTouched: number } | null>(null);

  async function run() {
    setLoading(true); setError(""); setResult(null); setProgress(null);
    let offset = 0;
    let totalCreated = 0, totalAlreadyMapped = 0, totalSkippedNoPlo = 0, totalSkippedNoSuggestion = 0, batchesTouched = 0, totalBatches = 0;
    try {
      // Loop, a handful of batches per request, until every batch in
      // the institution has been processed — a single request trying
      // to do all 40+ at once risked the same kind of timeout content
      // sync's "Sync All Content" ran into with many groups.
      while (true) {
        const res = await fetch("/api/omc/plo-matrix/auto-map-hec-all", {
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
    <div className="card">
      <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Auto-Map from HEC — All Batches</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Runs HEC auto-mapping across every batch in the institution at once, instead of one at a time — only
        fills in gaps, never overwrites or removes anything already set.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={run} disabled={loading} className="btn btn-brass">
        {progress ? `Mapping… ${progress.done}/${progress.total} batches` : loading ? "Mapping…" : "Auto-Map from HEC — All Batches"}
      </button>
      {result && (
        <p style={{ fontSize: 12, marginTop: 10, color: "var(--sage)" }}>
          Across {result.batchesTouched} batch(es): created {result.created} new mapping(s). {result.alreadyMapped} already existed,
          {" "}{result.skippedNoPlo} skipped (no matching PLO number in that batch), {result.skippedNoSuggestion} course(s) had no HEC suggestion on record.
        </p>
      )}
    </div>
  );
}
