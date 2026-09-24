"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NceacPackageButton({ apiEndpoint, reportIds, alreadyExists }: {
  apiEndpoint: string; reportIds: string[]; alreadyExists: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true); setError("");
    try {
      const res = await fetch(apiEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "NCEAC Accreditation Package",
          description: "Curated starting point for NCEAC's SAR/Annexure B — see the note below for what this does and doesn't cover.",
          reportIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card" style={{ background: "#FBEED2" }}>
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>NCEAC Accreditation Package</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        One click creates a bundle of {reportIds.length} reports curated from NCEAC's 2023 Accreditation
        Manual (Annexure B's document requirements and Criteria 2–3's evidence). This is a strong starting
        point, not a complete SAR substitute — NCEAC also requires narrative sections (vision/mission,
        program objectives, industrial linkages, quality policy) and records this app doesn't track (faculty
        contracts, annual budget, BOG/BOS meeting minutes, lab/library inventory) that still need preparing
        separately.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={generate} disabled={loading || alreadyExists} className="btn btn-brass" style={{ fontSize: 12.5 }}>
        {loading ? "Generating…" : alreadyExists ? "Already generated — see below" : "Generate NCEAC Package"}
      </button>
    </div>
  );
}
