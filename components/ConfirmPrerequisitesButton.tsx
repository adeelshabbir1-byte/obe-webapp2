"use client";

import { useState } from "react";

export default function ConfirmPrerequisitesButton({ batchId, confirmedAt: initialConfirmedAt }: { batchId: string; confirmedAt: string | null }) {
  const [confirmedAt, setConfirmedAt] = useState<string | null>(initialConfirmedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/batches/${batchId}/confirm-prerequisites`, { method: "PUT" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setConfirmedAt(data.prerequisitesConfirmedAt || new Date().toISOString());
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card no-print" style={{ borderColor: confirmedAt ? "var(--sage)" : "var(--rust)" }}>
      {error && <div className="err">{error}</div>}
      {confirmedAt ? (
        <p style={{ fontSize: 12.5, color: "var(--sage)" }}>✓ Prerequisite Map confirmed for this batch on {new Date(confirmedAt).toLocaleDateString()}. Courses can be offered.</p>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 10 }}>
            Not yet confirmed — this batch's courses can't be offered until you confirm the prerequisite setup is complete (even if a course genuinely has none).
          </p>
          <button onClick={confirm} disabled={loading} className="btn btn-brass">{loading ? "Confirming…" : "Confirm Prerequisite Map Complete"}</button>
        </>
      )}
    </div>
  );
}
