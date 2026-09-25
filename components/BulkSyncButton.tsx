"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BulkSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function runSync() {
    setLoading(true); setError(""); setResult(""); setProgress("");

    let totalSeeded = 0;
    let totalSkippedFollower = 0;
    let totalSkippedNoContent = 0;
    const perBatchTotals = new Map<string, number>();
    let round = 0;

    try {
      while (true) {
        round++;
        setProgress(`Working… ${totalSeeded} course(s) loaded so far (round ${round}).`);
        const res = await fetch("/api/coordinator/bulk-sync-from-curriculum", { method: "POST" });
        let data: any;
        try {
          data = await res.json();
        } catch {
          setError(`The server didn't return a valid response on round ${round} (it may have hit a time limit mid-batch). ${totalSeeded} course(s) were loaded before this happened — safe to just click the button again to pick up where it left off, since already-loaded courses are automatically skipped.`);
          setLoading(false);
          router.refresh();
          return;
        }
        if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }

        totalSeeded += data.seeded;
        totalSkippedFollower += data.skippedFollower;
        totalSkippedNoContent += data.skippedNoContent;
        for (const b of data.perBatch) perBatchTotals.set(b.batchLabel, (perBatchTotals.get(b.batchLabel) || 0) + b.seeded);

        if (!data.mightHaveMore) break;
        if (round > 200) break; // sane upper bound so a stuck loop can't run forever
      }

      const lines = Array.from(perBatchTotals.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([label, n]) => `${label}: ${n} course(s) loaded`);
      setResult(
        `${totalSeeded} course(s) loaded with starting CLOs and lectures.` +
        (totalSkippedFollower ? ` ${totalSkippedFollower} skipped (follower courses, inherit from their base automatically).` : "") +
        (totalSkippedNoContent ? ` ${totalSkippedNoContent} skipped (no starting content exists yet for those specific courses).` : "") +
        (lines.length ? `\n${lines.join("\n")}` : "")
      );
      setProgress("");
      setLoading(false);
      router.refresh();
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 13, marginBottom: 4 }}>Load starting content from the curriculum</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>
        For every course across all your batches that's linked to a Master Curriculum course and doesn't
        already have CLOs, this loads that course's starting CLOs, 32-lecture plan, and textbook/reference
        material. Nothing with existing CLOs is ever touched. Runs in small batches automatically, so this
        may take a little while for a large number of courses — leave the page open until it finishes.
      </p>
      <button type="button" className="btn btn-brass" onClick={runSync} disabled={loading}>
        {loading ? "Loading…" : "Load Content for All Eligible Courses"}
      </button>
      {progress && <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 8 }}>{progress}</p>}
      {error && <p style={{ color: "#B1512E", fontSize: 12, marginTop: 8 }}>{error}</p>}
      {result && <pre style={{ fontSize: 11.5, marginTop: 8, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{result}</pre>}
    </div>
  );
}
