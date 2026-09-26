"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoMapCloLevelAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ suggested: number; skippedNoConfidentMatch: number; alreadyMapped: number; batchesTouched: number; batchesSkippedNoPlos: string[] } | null>(null);

  async function run() {
    if (!confirm(
      "This maps individual CLOs to PLOs by keyword matching, across every batch in the institution at once — a guess, not a " +
      "verified mapping, and the field that actually drives weighted PLO attainment scoring. Review every suggestion afterward " +
      "in each course's CLO editor before trusting it. Continue?"
    )) return;

    setLoading(true); setError(""); setResult(null); setProgress(null);
    let offset = 0;
    let totalSuggested = 0, totalSkipped = 0, totalAlreadyMapped = 0, batchesTouched = 0, totalBatches = 0;
    const skippedNoPlos = new Set<string>();

    try {
      while (true) {
        const res = await fetch("/api/omc/plo-matrix/auto-map-clo-level-all", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, pageSize: 2 }),
        });
        let data: any = {};
        try { data = await res.json(); } catch {
          setError(`The server didn't return a valid response partway through. ${totalSuggested} CLO(s) were mapped before this happened — safe to click this again, since already-mapped CLOs are left untouched and it'll pick up further along.`);
          setLoading(false); setProgress(null);
          return;
        }
        if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); setProgress(null); return; }

        totalSuggested += data.suggested; totalSkipped += data.skippedNoConfidentMatch; totalAlreadyMapped += data.alreadyMapped;
        for (const b of data.batchesSkippedNoPlos || []) skippedNoPlos.add(b);
        batchesTouched += data.batchesProcessed.length + (data.batchesSkippedNoPlos?.length || 0);
        totalBatches = data.totalBatches;
        setProgress({ done: batchesTouched, total: totalBatches });

        if (data.done) break;
        offset = data.nextOffset;
      }
      setResult({ suggested: totalSuggested, skippedNoConfidentMatch: totalSkipped, alreadyMapped: totalAlreadyMapped, batchesTouched, batchesSkippedNoPlos: Array.from(skippedNoPlos) });
      setLoading(false); setProgress(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); setProgress(null); }
  }

  return (
    <div className="card" style={{ background: "#FBEED2" }}>
      <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>⚠️ Auto-Map Individual CLOs to PLOs — All Batches (Unverified)</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Same as the per-batch version below, but across every batch in the institution at once — keyword-matched
        and unverified, this is the field that actually drives weighted PLO attainment scoring (separate from,
        and more granular than, the course-level matrix tools above). Only fills gaps; a batch with no PLOs
        defined yet is skipped and listed below rather than causing an error.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={run} disabled={loading} className="btn" style={{ background: "#96650F", borderColor: "#96650F", color: "#fff" }}>
        {progress ? `Mapping… ${progress.done}/${progress.total} batches` : loading ? "Mapping…" : "Auto-Map CLOs to PLOs — All Batches"}
      </button>
      {result && (
        <div style={{ fontSize: 12, marginTop: 10, color: "#96650F" }}>
          <p>
            Across {result.batchesTouched} batch(es): mapped {result.suggested} CLO(s) — review these in each course's CLO editor.
            {" "}{result.skippedNoConfidentMatch} had no confident keyword match, {result.alreadyMapped} already had a PLO set.
          </p>
          {result.batchesSkippedNoPlos.length > 0 && (
            <p style={{ marginTop: 6 }}>Skipped (no PLOs defined yet): {result.batchesSkippedNoPlos.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
