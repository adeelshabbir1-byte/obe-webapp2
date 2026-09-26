"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// The CLO-level counterpart to AutoMapSystemButton -- that one only
// ever fills the coarser course<->PLO matrix and never touches
// mappedPloId on an actual CLO, which is what the weighted attainment
// calculation is built on. Same cautious posture: keyword-matched,
// unverified, tagged distinctly from a Subject Expert's own
// deliberate choice, meant to be reviewed afterward rather than
// trusted outright. Chunked because a batch can have many courses,
// each with several CLOs each needing comparison against every PLO.
export default function AutoMapCloLevelButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ suggested: number; skippedNoConfidentMatch: number; alreadyMapped: number } | null>(null);

  async function run() {
    if (!confirm(
      "This maps individual CLOs to PLOs by matching keywords in their wording — this is a guess, not a verified mapping, and " +
      "it's the field that actually drives weighted PLO attainment scoring (a coarser course-level matrix already exists separately). " +
      "Review every suggestion afterward in each course's CLO editor before trusting it. Continue?"
    )) return;

    setLoading(true); setError(""); setResult(null);
    let totalSuggested = 0, totalSkipped = 0, totalAlreadyMapped = 0, round = 0;
    let cursor: string | undefined;

    try {
      while (true) {
        round++;
        setProgress(`Mapping… ${totalSuggested} CLO(s) mapped so far (round ${round}).`);
        const res = await fetch("/api/omc/plo-matrix/auto-map-clo-level", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, cursor }),
        });
        let data: any = {};
        try { data = await res.json(); } catch {
          setError(`The server didn't return a valid response on round ${round}. ${totalSuggested} CLO(s) were mapped before this happened — safe to click this again to pick up where it left off, since already-mapped CLOs are left untouched.`);
          setLoading(false); setProgress("");
          return;
        }
        if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); setProgress(""); return; }

        totalSuggested += data.suggested; totalSkipped += data.skippedNoConfidentMatch; totalAlreadyMapped += data.alreadyMapped;
        cursor = data.nextCursor;
        if (!data.mightHaveMore || !cursor) break;
        if (round > 200) break; // sane upper bound so a stuck loop can't run forever
      }
      setResult({ suggested: totalSuggested, skippedNoConfidentMatch: totalSkipped, alreadyMapped: totalAlreadyMapped });
      setProgress("");
      setLoading(false);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); setProgress(""); }
  }

  return (
    <div className="card" style={{ background: "#FBEED2" }}>
      <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>⚠️ Auto-Map Individual CLOs to PLOs (Unverified)</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Suggests a PLO for each CLO that doesn't have one yet, by matching keywords between the CLO's own
        wording and this batch's PLO descriptions — separate from, and more granular than, the course-level
        matrix tools above. This is the field weighted PLO attainment scoring actually reads, so an unmapped
        CLO here means that outcome is invisible to attainment analytics regardless of what the course-level
        matrix shows. Only fills gaps, never overwrites an existing choice or changes which PLO it points to.
      </p>
      {error && <div className="err">{error}</div>}
      {progress && <div style={{ fontSize: 12, color: "#96650F", marginBottom: 8 }}>{progress}</div>}
      <button onClick={run} disabled={loading} className="btn" style={{ background: "#96650F", borderColor: "#96650F", color: "#fff" }}>
        {loading ? "Mapping…" : "Auto-Map CLOs to PLOs"}
      </button>
      {result && (
        <p style={{ fontSize: 12, marginTop: 10, color: "#96650F" }}>
          Mapped {result.suggested} CLO(s) — review these in each course's CLO editor. {result.skippedNoConfidentMatch} had no confident
          keyword match and were left unmapped, {result.alreadyMapped} already had a PLO set and were left alone.
        </p>
      )}
    </div>
  );
}
