"use client";

import { useState } from "react";

type Result = { peo: string; status: "STRONG" | "PARTIAL" | "GAP"; supportingPloNumbers: number[]; reasoning: string };

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  STRONG: { bg: "#E2F4E8", fg: "#1D8A4E", label: "Strong" },
  PARTIAL: { bg: "#FBEED2", fg: "#96650F", label: "Partial" },
  GAP: { bg: "#FBE2DF", fg: "#C0312B", label: "Gap" },
};

export default function PeoAlignmentCheck({ degreeProgram, batchId, peoCount }: { degreeProgram: string; batchId: string; peoCount: number }) {
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true); setError(""); setResults(null);
    try {
      const res = await fetch("/api/coordinator/peo-alignment-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ degreeProgram, batchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResults(data.results); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>PEO ↔ PLO Alignment Check (AI)</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
        Checks whether this batch's PLOs, collectively, plausibly support each PEO above — an unsupported PEO
        is a real accreditation gap, since there's no traceable path from what students learn to that
        longer-term objective. A judgment call, not a final verdict — review before relying on it.
      </p>
      {error && <div className="err">{error}</div>}
      <button onClick={run} disabled={loading || peoCount === 0} className="btn btn-brass">
        {loading ? "Checking…" : "Run Alignment Check"}
      </button>
      {peoCount === 0 && <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>Add at least one PEO above first.</p>}

      {results && (
        <div style={{ marginTop: 14 }}>
          {results.map((r, i) => {
            const style = STATUS_STYLE[r.status] || STATUS_STYLE.GAP;
            return (
              <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < results.length - 1 ? "1px solid var(--line)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ fontSize: 12.5, flex: 1 }}>{r.peo}</div>
                  <span style={{ background: style.bg, color: style.fg, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, whiteSpace: "nowrap" }}>
                    {style.label}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 4 }}>
                  {r.supportingPloNumbers.length > 0 ? `Supported by: PLO-${r.supportingPloNumbers.join(", PLO-")}` : "No supporting PLOs identified."}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 3 }}>{r.reasoning}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
