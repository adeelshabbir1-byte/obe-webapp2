"use client";

import { useState } from "react";

type Section = { id: string; batchLabel: string };

export default function LinkedSectionsBanner({ courseId, linkedSections, showSyncClos }: { courseId: string; linkedSections: Section[]; showSyncClos?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<number | null>(null);
  const [error, setError] = useState("");

  if (linkedSections.length === 0) return null;

  async function sync(syncClos: boolean) {
    setLoading(true); setError(""); setOk(null);
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/sync-to-linked-sections`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ syncWeights: true, syncClos }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(data.syncedCount); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card no-print" style={{ borderColor: "var(--brass)" }}>
      <p style={{ fontSize: 12.5, marginBottom: 8 }}>
        <b>You teach {linkedSections.length + 1} section(s) of this course this semester:</b> this one, plus {linkedSections.map((s) => s.batchLabel).join(", ")}.
        Settings aren't shared automatically — use the buttons below to copy this section's setup to the others whenever you want them to match.
      </p>
      {error && <div className="err">{error}</div>}
      {ok !== null && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>Synced to {ok} other section(s).</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => sync(false)} disabled={loading} className="btn btn-brass" style={{ padding: "5px 12px", fontSize: 12 }}>
          {loading ? "Syncing…" : "Copy Weights to Other Sections"}
        </button>
        {showSyncClos && (
          <button onClick={() => sync(true)} disabled={loading} className="btn btn-brass" style={{ padding: "5px 12px", fontSize: 12 }}>
            {loading ? "Syncing…" : "Copy Weights + CLOs to Other Sections"}
          </button>
        )}
      </div>
    </div>
  );
}
