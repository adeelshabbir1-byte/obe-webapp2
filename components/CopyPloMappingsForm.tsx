"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Batch = { id: string; label: string };

export default function CopyPloMappingsForm({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [sourceBatchId, setSourceBatchId] = useState(batches[0]?.id || "");
  const [targetBatchId, setTargetBatchId] = useState(batches[1]?.id || batches[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ copiedCount: number; skippedNoMatch: number } | null>(null);

  async function copy() {
    if (sourceBatchId === targetBatchId) { setError("Pick two different batches."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/omc/plo-matrix/copy-from-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBatchId, targetBatchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResult(data); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {result && (
        <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
          Copied {result.copiedCount} mapping(s).{result.skippedNoMatch > 0 && ` ${result.skippedNoMatch} couldn't be matched (different course codes or PLO numbers).`}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Copy From</label>
          <select value={sourceBatchId} onChange={(e) => setSourceBatchId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 220 }}>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Copy Into</label>
          <select value={targetBatchId} onChange={(e) => setTargetBatchId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 220 }}>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
        <button onClick={copy} disabled={loading} className="btn btn-brass">{loading ? "Copying…" : "Copy Mappings"}</button>
      </div>
    </div>
  );
}
