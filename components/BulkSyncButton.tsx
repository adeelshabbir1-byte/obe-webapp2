"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BulkSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function runSync() {
    setLoading(true); setError(""); setResult("");
    try {
      const res = await fetch("/api/coordinator/bulk-sync-from-curriculum", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      const lines = data.perBatch.map((b: any) => `${b.batchLabel}: ${b.seeded} course(s) loaded`);
      setResult(
        `${data.seeded} course(s) loaded with starting CLOs and lectures.` +
        (data.skippedFollower ? ` ${data.skippedFollower} skipped (follower courses, inherit from their base automatically).` : "") +
        (data.skippedNoContent ? ` ${data.skippedNoContent} skipped (no starting content exists yet for those specific courses).` : "") +
        (lines.length ? `\n${lines.join("\n")}` : "")
      );
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
        material in one pass. Nothing with existing CLOs is ever touched.
      </p>
      <button type="button" className="btn btn-brass" onClick={runSync} disabled={loading}>
        {loading ? "Loading…" : "Load Content for All Eligible Courses"}
      </button>
      {error && <p style={{ color: "#B1512E", fontSize: 12, marginTop: 8 }}>{error}</p>}
      {result && <pre style={{ fontSize: 11.5, marginTop: 8, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{result}</pre>}
    </div>
  );
}
